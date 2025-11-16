from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import ArticleCategoryViewSet, ArticleViewSet, receive_message

router = DefaultRouter()
router.register(r"categories", ArticleCategoryViewSet, basename="article-category")
router.register(r"articles", ArticleViewSet, basename="article")

urlpatterns = [
    path("", include(router.urls)),
    path("message/", receive_message, name="receive-message"),
]
