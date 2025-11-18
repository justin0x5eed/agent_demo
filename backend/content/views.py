import json
import os
import tempfile

import redis
from django.conf import settings
from django.shortcuts import render
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_redis import RedisVectorStore
from langchain_ollama import OllamaEmbeddings
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from langchain_ollama import OllamaLLM
from redis.commands.search.query import Query

MODELS = {
    "qwen3": "qwen3:30b",
    "gemma3": "gemma3:27b",
    "gpt-oss": "gpt-oss:20b",
}

ALLOWED_FILE_TYPES = {"txt", "doc", "docx"}
MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024  # 1 MB
REDIS_INDEX_NAME = "idx_chunks"


def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
        "models_json": json.dumps(MODELS),
    }

    return render(request, "index.html", context)


def _load_documents_from_bytes(file_bytes: bytes, extension: str, file_name: str):
    """Persist uploaded bytes temporarily and load them with TextLoader."""

    suffix = f".{extension}" if extension else ""
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp_file:
            tmp_file.write(file_bytes)
            tmp_path = tmp_file.name

        loader = TextLoader(tmp_path, encoding="utf-8")
        documents = loader.load()
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)

    for document in documents:
        document.metadata["source"] = file_name

    return documents


def _escape_redis_query_value(raw_value: str) -> str:
    """Escape user-provided strings for a Redis full-text query."""

    if not raw_value:
        return raw_value

    escaped = raw_value.replace("\\", "\\\\")
    escaped = escaped.replace('"', '\\"')
    return escaped


def _delete_existing_sources(redis_url: str, index_name: str, sources: set[str]) -> set[str]:
    """Remove all chunks for the provided sources and return the ones that were deleted."""

    if not sources:
        return set()

    print(
        "[Redis/Delete] 正在准备删除以下来源:",
        ", ".join(sorted(sources)) or "<无>",
    )

    try:
        client = redis.from_url(redis_url, decode_responses=True)
    except redis.exceptions.RedisError as exc:  # pragma: no cover - connection guard
        raise RuntimeError(f"Unable to connect to Redis: {exc}") from exc

    deleted_sources: set[str] = set()
    search = client.ft(index_name)
    for source in sources:
        escaped_value = _escape_redis_query_value(source)
        query_string = f'@source:"{escaped_value}"'
        page_size = 500

        print(f"[Redis/Delete] 正在检查来源 '{source}' 的现有分片")
        while True:
            query = Query(query_string).return_fields().paging(0, page_size)
            try:
                result = search.search(query)
            except redis.exceptions.ResponseError as exc:
                if "Unknown Index name" in str(exc):
                    # No index has been created yet, nothing to delete.
                    return deleted_sources
                raise RuntimeError(
                    f"Unable to inspect existing chunks for '{source}': {exc}"
                ) from exc

            docs = getattr(result, "docs", None) or []
            if not docs:
                break

            ids = [doc.id for doc in docs if getattr(doc, "id", None)]
            if not ids:
                print(
                    f"[Redis/Delete] 未返回来源 '{source}' 的 Redis 文档 ID，停止循环"
                )
                break

            try:
                client.delete(*ids)
            except redis.exceptions.RedisError as exc:
                raise RuntimeError(
                    f"Unable to remove existing chunks for '{source}': {exc}"
                ) from exc

            deleted_sources.add(source)
            print(
                f"[Redis/Delete] 已删除来源 '{source}' 的 {len(ids)} 个分片，继续翻页"
            )

    return deleted_sources


@api_view(["POST"])
def upload_document(request):
    """Handle one or more document uploads without persisting them to disk."""

    uploads = request.FILES.getlist("file")
    if not uploads:
        # Fallback to single value lookups for clients that don't use getlist.
        single_upload = request.FILES.get("file")
        if single_upload is not None:
            uploads = [single_upload]

    if not uploads:
        return Response(
            {"detail": "No file provided. Please upload a txt, doc, or docx file."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    aggregated_chunks = []
    per_file_results = []

    sources_to_replace: set[str] = set()

    print(f"[Upload] 收到 {len(uploads)} 个文件等待处理")
    for upload in uploads:
        file_name = upload.name
        extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
        if extension not in ALLOWED_FILE_TYPES:
            return Response(
                {
                    "detail": (
                        f"Unsupported file type '{extension}' for file '{file_name}'. "
                        f"Allowed: {', '.join(sorted(ALLOWED_FILE_TYPES))}."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if upload.size > MAX_FILE_SIZE_BYTES:
            return Response(
                {
                    "detail": (
                        f"File '{file_name}' is too large. Maximum size is 1MB."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        upload.seek(0)
        file_bytes = upload.read()

        try:
            file_content = file_bytes.decode("utf-8")
        except UnicodeDecodeError:
            return Response(
                {
                    "detail": (
                        f"Only UTF-8 encoded text files are supported (failed on '{file_name}')."
                    )
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            documents = _load_documents_from_bytes(file_bytes, extension, file_name)
        except Exception as exc:  # pragma: no cover - defensive guard
            return Response(
                {"detail": f"Unable to load document '{file_name}': {exc}"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        chunked_documents = text_splitter.split_documents(documents)
        print(
            f"[Upload] 文件 '{file_name}' 被切分为 {len(chunked_documents)} 个分片"
        )
        aggregated_chunks.extend(chunked_documents)

        per_file_results.append(
            {
                "status": "processed",
                "file_name": file_name,
                "file_size": upload.size,
                "content_length": len(file_content),
                "chunk_count": len(chunked_documents),
            }
        )
        sources_to_replace.add(file_name)

    redis_url = getattr(settings, "REDIS_URL", "redis://127.0.0.1:6379/0")

    try:
        replaced_sources = _delete_existing_sources(
            redis_url=redis_url,
            index_name=REDIS_INDEX_NAME,
            sources=sources_to_replace,
        )
    except RuntimeError as exc:  # pragma: no cover - redis/vector store runtime guard
        return Response(
            {"detail": str(exc)},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    print(
        "[Upload] 标记为需要替换的来源:",
        ", ".join(sorted(sources_to_replace)) or "<无>",
    )
    print(
        "[Upload] 实际完成替换的来源:",
        ", ".join(sorted(replaced_sources)) or "<无>",
    )

    if replaced_sources:
        for result in per_file_results:
            result["replaced_previous"] = result["file_name"] in replaced_sources
    else:
        for result in per_file_results:
            result["replaced_previous"] = False

    if not aggregated_chunks:
        # Nothing to embed, return the per-file metadata as-is.
        if len(per_file_results) == 1:
            return Response(per_file_results[0], status=status.HTTP_200_OK)

        total_chunks = sum(result["chunk_count"] for result in per_file_results)
        return Response(
            {
                "status": "processed",
                "file_count": len(per_file_results),
                "total_chunks": total_chunks,
                "files": per_file_results,
            },
            status=status.HTTP_200_OK,
        )

    embedder = OllamaEmbeddings(
        model="qwen3-embedding:0.6b",
        base_url="http://192.168.50.17:11434",
    )
    print(f"[Upload] 正在向 Redis 写入 {len(aggregated_chunks)} 个分片的向量")
    try:
        RedisVectorStore.from_documents(
            documents=aggregated_chunks,
            embedding=embedder,
            redis_url=redis_url,
            index_name=REDIS_INDEX_NAME,
        )
    except Exception as exc:  # pragma: no cover - redis/vector store runtime guard
        return Response(
            {"detail": f"Unable to store document chunks in Redis: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )
    print("[Upload] Redis 向量索引更新完成")

    if len(per_file_results) == 1:
        return Response(per_file_results[0], status=status.HTTP_200_OK)

    total_chunks = sum(result["chunk_count"] for result in per_file_results)
    return Response(
        {
            "status": "processed",
            "file_count": len(per_file_results),
            "total_chunks": total_chunks,
            "files": per_file_results,
        },
        status=status.HTTP_200_OK,
    )


def _normalize_file_names(raw_names):
    """Return a clean list of filenames from user payload."""

    if not raw_names:
        return []

    if isinstance(raw_names, str):
        raw_names = [raw_names]

    cleaned = []
    for name in raw_names:
        if isinstance(name, str):
            stripped = name.strip()
            if stripped:
                cleaned.append(stripped)

    return cleaned


@api_view(["POST"])
def receive_message(request):

    base_url = "http://192.168.50.17:11434"

    data = request.data
    if not data:
        return Response({"detail": "No data provided."}, status=400)

    model_name = MODELS[data["model"]]
    question = data["message"]

    llm = OllamaLLM(model=model_name, base_url=base_url)

    embedder = OllamaEmbeddings(
        model="qwen3-embedding:0.6b",
        base_url=base_url,
    )

    redis_url = getattr(settings, "REDIS_URL", "redis://127.0.0.1:6379/0")
    try:
        vector_store = RedisVectorStore.from_existing_index(
            embedding=embedder,
            redis_url=redis_url,
            index_name=REDIS_INDEX_NAME,
        )
    except Exception as exc:  # pragma: no cover - vector store runtime guard
        return Response(
            {"detail": f"Unable to connect to Redis vector index: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    file_names = _normalize_file_names(data.get("file"))
    allowed_sources = set(file_names)
    if allowed_sources:
        print("[Retrieval] 仅在以下来源范围内检索:", ", ".join(sorted(allowed_sources)))
    else:
        print("[Retrieval] 未提供来源过滤条件，将检索全部文档")

    retrieved_docs = []
    try:
        similarity_k = 3
        if allowed_sources:
            similarity_k = max(3, len(allowed_sources) * 3)

        print(
            f"[Retrieval] 正在以 k={similarity_k} 执行相似度检索，问题为: {question}"
        )
        retrieved_docs = vector_store.similarity_search(question, k=similarity_k)
    except Exception as exc:  # pragma: no cover - vector store runtime guard
        print(f"[Retrieval] 相似度检索失败: {exc}")

    if allowed_sources:
        retrieved_docs = [
            doc for doc in retrieved_docs if doc.metadata.get("source") in allowed_sources
        ]
        print(
            f"[Retrieval] 过滤后剩余 {len(retrieved_docs)} 个分片"
        )
    else:
        print(f"[Retrieval] 未过滤直接返回 {len(retrieved_docs)} 个分片")

    formatted_chunks = []
    for doc in retrieved_docs:
        source = doc.metadata.get("source", "unknown")
        chunk = doc.page_content.strip()
        formatted_chunks.append(f"Source: {source}\n{chunk}")

    if formatted_chunks:
        prompt_context = "\n\n".join(formatted_chunks)
        prompt = (
            "You are a helpful assistant. Use the provided context to answer the "
            "question. If the context does not contain the answer, say you don't know. "
            "Use user asking language response. 请使用用户提问的语言进行回答。\n"
            f"Context:\n{prompt_context}\n\nQuestion: {question}\nAnswer:"
        )
    else:
        prompt = (
            "You are a helpful assistant. There is no knowledge base context "
            "available, so rely on your general reasoning or tools to answer the "
            "question as best as you can. Use user asking language response. "
            "请使用用户提问的语言进行回答。\n"
            f"Question: {question}\nAnswer:"
        )

    print(f"[Frontend] 收到的前端载荷: {data}")
    answer = llm.invoke(prompt)
    tool = DuckDuckGoSearchRun()

    _ = tool.run(question)

    response_payload = {
        "prompt": prompt,
        "answer": answer,
        "knowledge_base_hits": len(formatted_chunks),
    }
    if retrieved_docs:
        response_payload["retrieved_chunks"] = [
            {"source": doc.metadata.get("source"), "content": doc.page_content}
            for doc in retrieved_docs
        ]

    return Response(response_payload)
