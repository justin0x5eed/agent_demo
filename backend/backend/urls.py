"""backend URL Configuration."""

from django.contrib import admin
from django.urls import include, path

try:
    import django_vite.urls as django_vite_urls
except ModuleNotFoundError:  # pragma: no cover - optional dependency
    django_vite_urls = None

from content.views import index

urlpatterns = [
    path("", index, name="index"),
    path("admin/", admin.site.urls),
    path("api/", include("content.urls")),
]

if django_vite_urls is not None:
    urlpatterns.append(path("__django_vite/", include(django_vite_urls)))
