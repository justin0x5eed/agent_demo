from django.conf import settings
from django.shortcuts import render
from rest_framework import mixins, viewsets

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

def index(request):
    """Render the simple homepage."""

    context = {
        "debug": settings.DEBUG,
    }

    return render(request, "index.html", context)
