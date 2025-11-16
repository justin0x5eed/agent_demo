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
