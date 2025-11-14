from rest_framework import serializers

from .models import Article, ArticleCategory


class ArticleCategorySerializer(serializers.ModelSerializer):
    class Meta:
        model = ArticleCategory
        fields = ["id", "name"]


class ArticleSerializer(serializers.ModelSerializer):
    category = ArticleCategorySerializer(read_only=True)
    owner = serializers.CharField(source="owner.username", read_only=True)

    class Meta:
        model = Article
        fields = [
            "id",
            "category",
            "owner",
            "title",
            "slug",
            "content",
            "created_at",
            "updated_at",
        ]
