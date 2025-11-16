from django.urls import path

from .views import receive_message, upload_document

urlpatterns = [
    path("message/", receive_message, name="receive-message"),
    path("upload/", upload_document, name="upload-document"),
]
