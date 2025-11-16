import logging

from django.conf import settings
from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["POST"])
def receive_message(request):
    """Receive a payload from the frontend and print it."""

    base_url = "http://192.168.50.17:11434"

    MODELS = [
        ("qwen3", "qwen3:30b"),
        ("gemma3", "gemma3:27b"),
        ("gpt-oss", "gpt-oss:20b"),
    ]
    
    # 修改下方索引以选择不同模型
    SELECTED_MODEL_INDEX = 0
    
    
    model_key, model_name = MODELS[SELECTED_MODEL_INDEX]
    
    llm = OllamaLLM(model=model_name, base_url=base_url)
    


    data = request.data
    if not data:
        return Response({"detail": "No data provided."}, status=400)

    print(f"Frontend payload: {data}")
    answer = llm.invoke(question)

    return Response({"status": "received", "data": data})



def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
    }

    return render(request, "index.html", context)
