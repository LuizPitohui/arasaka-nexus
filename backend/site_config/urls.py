from django.urls import path

from .views import contact, legal_document

urlpatterns = [
    path("contact/", contact, name="site-contact"),
    path("legal/<slug:slug>/", legal_document, name="site-legal-document"),
]
