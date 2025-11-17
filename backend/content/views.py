import json
import os
import tempfile

import redis
from django.conf import settings
from django.http import JsonResponse, StreamingHttpResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_redis import RedisVectorStore
from langchain_community.vectorstores.redis import RedisFilter
from langchain_ollama import OllamaEmbeddings
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

    text_splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    chunked_documents = text_splitter.split_documents(documents)

    embedder = OllamaEmbeddings(
        model="qwen3-embedding:0.6b",
        base_url="http://192.168.50.17:11434",
    )

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

    redis_url = getattr(settings, "REDIS_URL", "redis://127.0.0.1:6379/0")
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


@csrf_exempt
@require_POST
def receive_message(request):

    base_url = "http://192.168.50.17:11434"

    try:
        body = request.body.decode("utf-8")
    except UnicodeDecodeError:
        return JsonResponse({"detail": "Request body must be valid UTF-8."}, status=400)

    data = {}
    if body.strip():
        try:
            data = json.loads(body)
        except json.JSONDecodeError:
            return JsonResponse({"detail": "Malformed JSON payload."}, status=400)
    elif request.POST:
        data = request.POST.dict()

    if not isinstance(data, dict) or not data:
        return JsonResponse({"detail": "No data provided."}, status=400)

    model_key = data.get("model")
    if model_key not in MODELS:
        return JsonResponse({"detail": "Invalid or missing model."}, status=400)

    message = data.get("message")
    if not isinstance(message, str) or not message.strip():
        return JsonResponse({"detail": "Message is required."}, status=400)

    model_name = MODELS[model_key]
    question = message.strip()

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
        return JsonResponse(
            {"detail": f"Unable to connect to Redis vector index: {exc}"},
            status=500,
        )

    file_names = _normalize_file_names(data.get("file"))
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

    tool = DuckDuckGoSearchRun()
    _ = tool.run(question)

    metadata_payload = {
        "prompt": prompt,
        "knowledge_base_hits": len(formatted_chunks),
        "web_search_used": bool(data.get("enableWebSearch")),
        "tool_used": bool(data.get("enableTools")),
    }

    if retrieved_docs:
        metadata_payload["retrieved_chunks"] = [
            {"source": doc.metadata.get("source"), "content": doc.page_content}
            for doc in retrieved_docs
        ]

    def stream_response():
        yield f"data: {json.dumps({'type': 'metadata', 'payload': metadata_payload})}\n\n"
        try:
            for chunk in llm.stream(prompt):
                if chunk:
                    yield f"data: {json.dumps({'type': 'token', 'token': chunk})}\n\n"
        except Exception as exc:  # pragma: no cover - streaming guard
            yield f"data: {json.dumps({'type': 'error', 'detail': str(exc)})}\n\n"
        yield "data: {\"type\": \"done\"}\n\n"

    response = StreamingHttpResponse(stream_response(), content_type="text/event-stream")
    response["Cache-Control"] = "no-cache"
    return response
