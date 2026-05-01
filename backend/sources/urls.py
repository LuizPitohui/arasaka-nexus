from django.urls import path

from . import views

app_name = "sources"

urlpatterns = [
    path("", views.list_sources, name="list"),
    path("overview/", views.overview, name="overview"),
    path("mihon/sub-sources/", views.mihon_sub_sources, name="mihon_sub_sources"),
    path("<str:source_id>/", views.source_detail, name="detail"),
    path("<str:source_id>/healthcheck/", views.trigger_healthcheck, name="healthcheck"),
]
