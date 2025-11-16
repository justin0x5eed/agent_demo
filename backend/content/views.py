import logging

from django.conf import settings
from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response


@api_view(["POST"])
def receive_message(request):
    """Receive a payload from the frontend and print it."""

    data = request.data
    if not data:
        return Response({"detail": "No data provided."}, status=400)

    print(f"Frontend payload: {data}")

    return Response({"status": "received", "data": data})



def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
    }

    return render(request, "index.html", context)
