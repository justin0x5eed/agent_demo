from django.conf import settings
from django.shortcuts import render
from rest_framework import mixins, viewsets, status
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


@api_view(["POST"])
def chat_message_view(request):
    """Receive chat messages from the frontend and print their payload."""

    payload = {
        "model": request.data.get("model"),
        "enable_network_search": request.data.get("enable_network_search"),
        "enable_tools": request.data.get("enable_tools"),
        "message": request.data.get("message"),
    }

    print("Received chat payload:", payload)

    return Response({"status": "received", "payload": payload}, status=status.HTTP_200_OK)


def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
    }

    return render(request, "index.html", context)
