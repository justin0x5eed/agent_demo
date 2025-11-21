import json
import os
import re
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




def _delete_existing_sources(redis_url: str, index_name: str, sources: set[str]) -> set[str]:
    """Remove all chunks for the provided sources and return the ones that were deleted."""

    if not sources:
        return set()

    try:
        client = redis.from_url(redis_url, decode_responses=True)
    except redis.exceptions.RedisError as exc:  # pragma: no cover - connection guard
        raise RuntimeError(f"Unable to connect to Redis: {exc}") from exc

    deleted_sources: set[str] = set()
    search = client.ft(index_name)
    for source in sources:
        query_string = f'@source:"{source}"'
        page_size = 500

        while True:
            query = Query(query_string).return_fields().paging(0, page_size)
            try:
                result = search.search(query)
            except redis.exceptions.ResponseError as exc:
                exc_message = str(exc).lower()
                if "unknown index name" in exc_message or "no such index" in exc_message:
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
                break

            try:
                client.delete(*ids)
            except redis.exceptions.RedisError as exc:
                raise RuntimeError(
                    f"Unable to remove existing chunks for '{source}': {exc}"
                ) from exc

            deleted_sources.add(source)

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

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    aggregated_chunks = []
    per_file_results = []

    sources_to_replace: set[str] = set()

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
    retrieved_docs = []

    if allowed_sources:
        filtered_docs = []
        for source in sorted(allowed_sources):
            filter_expression = f'@source:"{source}"'
            try:
                docs_for_source = vector_store.similarity_search(
                    question,
                    k=3,
                    filter=filter_expression,
                )
                filtered_docs.extend(docs_for_source)
            except Exception as exc:  # pragma: no cover - vector store runtime guard
                raise RuntimeError(
                    f"Similarity search failed for source '{source}': {exc}"
                ) from exc

        retrieved_docs = filtered_docs

    formatted_chunks = []
    for doc in retrieved_docs:
        source = doc.metadata.get("source", "unknown")
        chunk = doc.page_content.strip()
        formatted_chunks.append(f"Source: {source}\n{chunk}")

    enable_web_search = bool(data.get("enableWebSearch"))
    web_search_results = None
    if enable_web_search:
        try:
            search_tool = DuckDuckGoSearchRun()
            web_search_results = search_tool.run(question)
        except Exception as exc:  # pragma: no cover - web search runtime guard
            web_search_results = f"Web search failed: {exc}"

    contexts: list[str] = []
    if formatted_chunks:
        contexts.append("\n\n".join(formatted_chunks))
    if web_search_results:
        if isinstance(web_search_results, (dict, list)):
            contexts.append(json.dumps(web_search_results, ensure_ascii=False, indent=2))
        else:
            contexts.append(str(web_search_results))

    if contexts:
        prompt_context = "\n\n".join(contexts)
        prompt = (
            "You are a helpful AI assistant. Answer the user's question based on the "
            "following context. If the context does not provide enough information, "
            "respond with 'I don't know'. Always reply in the same language the user "
            "used when asking the question。\n"
            f"Context:\n{prompt_context}\n\nQuestion: {question}\nAnswer:"
        )
    else:
        prompt = (
            "You are a helpful AI assistant. There is no knowledge base context "
            "available. If you cannot answer with certainty, respond with 'I don't "
            "know'. Always reply in the same language the user used when asking the "
            "question。请使用用户提问的语言进行回答。\n"
            f"Question: {question}\nAnswer:"
        )

    print(f"[Frontend] Received payload from frontend: {data}")
    answer = llm.invoke(prompt)

    thinking = None
    think_match = re.search(r"<think>(.*?)</think>", str(answer), flags=re.DOTALL)
    if think_match:
        thinking = think_match.group(1).strip()
        answer = re.sub(r"<think>.*?</think>", "", str(answer), flags=re.DOTALL).strip()

    response_payload = {
        "prompt": prompt,
        "answer": answer,
        "knowledge_base_hits": len(formatted_chunks),
    }
    if thinking:
        response_payload["thinking"] = thinking
    if retrieved_docs:
        response_payload["retrieved_chunks"] = [
            {"source": doc.metadata.get("source"), "content": doc.page_content}
            for doc in retrieved_docs
        ]
    if enable_web_search:
        response_payload["web_search_results"] = web_search_results

    return Response(response_payload)
