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
from langchain_community.vectorstores.redis import RedisFilter
from langchain_ollama import OllamaEmbeddings
from redis.commands.search.query import Query
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response
from langchain_ollama import OllamaLLM

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


def _delete_existing_file_documents(redis_url: str, file_name: str) -> None:
    """Remove any Redis entries belonging to the provided filename."""

    try:
        client = redis.from_url(redis_url)
    except Exception as exc:  # pragma: no cover - defensive guard
        print(f"Unable to connect to Redis for cleanup: {exc}")
        return

    try:
        client.ft(REDIS_INDEX_NAME).info()
    except Exception:
        # Index does not exist yet, so there are no stale documents to remove.
        return

    filter_expression = RedisFilter.text("source") == file_name
    query_str = str(filter_expression)

    batch_size = 500
    offset = 0
    doc_ids = []

    while True:
        try:
            query = Query(query_str).paging(offset, batch_size)
            result = client.ft(REDIS_INDEX_NAME).search(query)
        except Exception as exc:  # pragma: no cover - redis runtime guard
            print(f"Unable to query Redis for cleanup: {exc}")
            break

        docs = getattr(result, "docs", None)
        if not docs:
            break

        doc_ids.extend(doc.id for doc in docs)

        offset += batch_size
        if result.total <= offset:
            break

    if doc_ids:
        try:
            client.delete(*doc_ids)
        except Exception as exc:  # pragma: no cover - redis runtime guard
            print(f"Failed to delete stale Redis documents: {exc}")


@api_view(["POST"])
def upload_document(request):
    """Handle a document upload without persisting it to disk."""

    upload = request.FILES.get("file")
    if upload is None:
        return Response(
            {"detail": "No file provided. Please upload a txt, doc, or docx file."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    file_name = upload.name
    extension = file_name.rsplit(".", 1)[-1].lower() if "." in file_name else ""
    if extension not in ALLOWED_FILE_TYPES:
        return Response(
            {"detail": f"Unsupported file type '{extension}'. Allowed: {', '.join(sorted(ALLOWED_FILE_TYPES))}."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    if upload.size > MAX_FILE_SIZE_BYTES:
        return Response(
            {"detail": "File too large. Maximum size is 1MB."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    # Read the contents without saving the file to disk
    file_bytes = upload.read()

    try:
        file_content = file_bytes.decode("utf-8")
    except UnicodeDecodeError:
        return Response(
            {"detail": "Only UTF-8 encoded text files are supported."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        documents = _load_documents_from_bytes(file_bytes, extension, file_name)
    except Exception as exc:  # pragma: no cover - defensive guard
        return Response(
            {"detail": f"Unable to load document: {exc}"},
            status=status.HTTP_400_BAD_REQUEST,
        )

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=500, chunk_overlap=100)
    chunked_documents = text_splitter.split_documents(documents)

    # Ensure every chunk retains the human-friendly filename so Redis can
    # filter on the correct "source" metadata during retrieval. Without this
    # step LangChain may persist the temporary path generated by TextLoader,
    # causing lookups to match chunks from other uploads.
    for chunk in chunked_documents:
        # Always overwrite the chunk metadata so we don't accidentally keep
        # the temporary file path produced by TextLoader (e.g. /tmp/tmpxyz),
        # which would later prevent us from filtering by the human-provided
        # filename.
        chunk.metadata["source"] = file_name

    embedder = OllamaEmbeddings(
        model="qwen3-embedding:0.6b",
        base_url="http://192.168.50.17:11434",
    )
    redis_url = getattr(settings, "REDIS_URL", "redis://127.0.0.1:6379/0")

    _delete_existing_file_documents(redis_url, file_name)

    if not chunked_documents:
        return Response(
            {
                "status": "processed",
                "file_name": file_name,
                "file_size": upload.size,
                "content_length": len(file_content),
                "chunk_count": 0,
            },
            status=status.HTTP_200_OK,
        )

    try:
        RedisVectorStore.from_documents(
            documents=chunked_documents,
            embedding=embedder,
            redis_url=redis_url,
            index_name=REDIS_INDEX_NAME,
        )
    except Exception as exc:  # pragma: no cover - redis/vector store runtime guard
        return Response(
            {"detail": f"Unable to store document chunks in Redis: {exc}"},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )

    return Response(
        {
            "status": "processed",
            "file_name": file_name,
            "file_size": upload.size,
            "content_length": len(file_content),
            "chunk_count": len(chunked_documents),
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
    metadata_filter = None
    if file_names:
        expressions = [RedisFilter.text("source") == name for name in file_names]
        metadata_filter = expressions[0]
        for expression in expressions[1:]:
            metadata_filter = metadata_filter | expression

    retrieved_docs = []
    try:
        similarity_kwargs = {"k": 3}
        if metadata_filter is not None:
            similarity_kwargs["filter_expression"] = metadata_filter

        retrieved_docs = vector_store.similarity_search(question, **similarity_kwargs)
    except Exception as exc:  # pragma: no cover - vector store runtime guard
        print(f"Vector store lookup failed: {exc}")

    if allowed_sources:
        retrieved_docs = [
            doc for doc in retrieved_docs if doc.metadata.get("source") in allowed_sources
        ]

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

    print(f"Frontend payload: {data}")
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
