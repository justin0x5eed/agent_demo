from django.conf import settings
from django.db import models


class ArticleCategory(models.Model):
    """Categorization for articles."""

    name = models.CharField(max_length=255, unique=True)

    class Meta:
        verbose_name = "Article Category"
        verbose_name_plural = "Article Categories"
        ordering = ["name"]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return self.name


class Article(models.Model):
    """Article content that belongs to a category and an owner."""

    category = models.ForeignKey(
        ArticleCategory,
        related_name="articles",
        on_delete=models.PROTECT,
    )
    owner = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        related_name="articles",
        on_delete=models.CASCADE,
    )
    title = models.CharField(max_length=255, blank=True)
    slug = models.SlugField(max_length=255, unique=True)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:  # pragma: no cover - simple representation
        return f"{self.category.name} - {self.owner}" if self.pk else "New Article"
