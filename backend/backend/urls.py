"""backend URL Configuration."""

from django.contrib import admin
from django.urls import include, path

from content.views import index

urlpatterns = [
    path("", index, name="index"),
    path("admin/", admin.site.urls),
    path("api/", include("content.urls")),
]
