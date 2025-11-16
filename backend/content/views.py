import json
import logging

from django.conf import settings
from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response

MODELS = {
    "qwen3": "qwen3:30b",
    "gemma3": "gemma3:27b",
    "gpt-oss": "gpt-oss:20b",
}


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

def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
        "models_json": json.dumps(MODELS),
    }

    return render(request, "index.html", context)
