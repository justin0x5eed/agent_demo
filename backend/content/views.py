import json
import os
import tempfile

import redis
from django.conf import settings
from django.shortcuts import render
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain_community.document_loaders import TextLoader
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_ollama import OllamaEmbeddings
from rest_framework import status
from rest_framework.decorators import api_view
from rest_framework.response import Response

MODELS = {
    "qwen3": "qwen3:30b",
    "gemma3": "gemma3:27b",
    "gpt-oss": "gpt-oss:20b",
}

ALLOWED_FILE_TYPES = {"txt", "doc", "docx"}
MAX_FILE_SIZE_BYTES = 1 * 1024 * 1024  # 1 MB


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
def receive_message(request):

    base_url = "http://192.168.50.17:11434"

    data = request.data
    if not data:
        return Response({"detail": "No data provided."}, status=400)

    model_name = MODELS[data["model"]]
    question = data["message"]
    
#    llm = OllamaLLM(model=model_name, base_url=base_url)

    print(f"Frontend payload: {data}")
#    answer = llm.invoke(question)
    tool = DuckDuckGoSearchRun()

    results = tool.run(question)

    return Response(results)


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

    chunk_texts = [doc.page_content for doc in chunked_documents]
    embeddings = embedder.embed_documents(chunk_texts) if chunk_texts else []

    chunks_with_embeddings = [
        {
            "text": doc.page_content,
            "metadata": doc.metadata,
            "embedding": vector,
        }
        for doc, vector in zip(chunked_documents, embeddings)
    ]

    redis_payload = {
        "file_name": file_name,
        "embedding_model": "qwen3-embedding:0.6b",
        "chunks": chunks_with_embeddings,
    }

    redis_client = redis.Redis.from_url(
        getattr(settings, "REDIS_URL", "redis://127.0.0.1:6379/0")
    )
    redis_client.set(file_name, json.dumps(redis_payload))

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

def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
        "models_json": json.dumps(MODELS),
    }

    return render(request, "index.html", context)
