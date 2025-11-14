from django.contrib import admin

from .models import Article, ArticleCategory


@admin.register(ArticleCategory)
class ArticleCategoryAdmin(admin.ModelAdmin):
    list_display = ("name",)
    search_fields = ("name",)


@admin.register(Article)
class ArticleAdmin(admin.ModelAdmin):
    list_display = ("id", "category", "owner", "created_at", "updated_at")
    list_filter = ("category", "created_at", "updated_at")
    search_fields = ("title", "slug", "content", "owner__username", "owner__email")
    autocomplete_fields = ("category", "owner")
    ordering = ("-created_at",)
    prepopulated_fields = {"slug": ("title",)}
