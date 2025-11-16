import json
from django.conf import settings
from django.shortcuts import render
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


@api_view(["POST"])
def receive_message(request):
    """Receive a payload from the frontend and print it."""

    base_url = "http://192.168.50.17:11434"

    data = request.data
    if not data:
        return Response({"detail": "No data provided."}, status=400)

    model_name = MODELS[data["model"]]
    question = data["message"]
    
#    llm = OllamaLLM(model=model_name, base_url=base_url)

    print(f"Frontend payload: {data}")
#    answer = llm.invoke(question)

    return Response({"status": "received", "data": [model_name, question]})


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
    file_content = upload.read()

    print(f"Uploaded file name: {file_name} file content: {file_content}")

    return Response(
        {
            "status": "received",
            "file_name": file_name,
            "file_size": upload.size,
            "content_length": len(file_content),
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
