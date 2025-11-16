import logging

from django.conf import settings
from django.shortcuts import render
from rest_framework import mixins, viewsets
from rest_framework.decorators import api_view
from rest_framework.response import Response

from .models import Article, ArticleCategory
from .serializers import ArticleCategorySerializer, ArticleSerializer


class ArticleCategoryViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only endpoints for article categories."""

    queryset = ArticleCategory.objects.all()
    serializer_class = ArticleCategorySerializer


class ArticleViewSet(mixins.ListModelMixin, mixins.RetrieveModelMixin, viewsets.GenericViewSet):
    """Read-only endpoints for articles."""

    queryset = Article.objects.select_related("category", "owner")
    serializer_class = ArticleSerializer


logger = logging.getLogger(__name__)


@api_view(["POST"])
def receive_message(request):
    """Receive a message from the frontend and log it."""

    message = request.data.get("message")
    if not message:
        return Response({"detail": "`message` is required."}, status=400)

    logger.info("Received message from frontend: %s", message)
    print(f"Frontend message: {message}")

    return Response({"status": "received", "message": message})


def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
    }

    return render(request, "index.html", context)
