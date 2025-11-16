from django.urls import path
from .views import receive_message

urlpatterns = [
    path("message/", receive_message, name="receive-message"),
]
