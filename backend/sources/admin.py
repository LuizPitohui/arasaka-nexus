from django.contrib import admin

from .models import Source, SourceChapter, SourceHealth, SourceHealthLog, SourceManga


@admin.register(Source)
class SourceAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "kind", "is_active", "priority", "base_url")
    list_filter = ("kind", "is_active")
    search_fields = ("id", "name", "base_url")
    list_editable = ("is_active", "priority")


@admin.register(SourceManga)
class SourceMangaAdmin(admin.ModelAdmin):
    list_display = ("source", "external_id", "title_at_source", "language", "manga", "last_synced_at")
    list_filter = ("source", "language")
    search_fields = ("external_id", "title_at_source")
    autocomplete_fields = ("manga",)


@admin.register(SourceChapter)
class SourceChapterAdmin(admin.ModelAdmin):
    list_display = ("source_manga", "number", "language", "title", "published_at")
    list_filter = ("language",)
    search_fields = ("external_id", "title")


@admin.register(SourceHealth)
class SourceHealthAdmin(admin.ModelAdmin):
    list_display = (
        "source",
        "status",
        "consecutive_failures",
        "error_rate_5m",
        "avg_latency_ms_5m",
        "p95_latency_ms_5m",
        "down_since",
        "parser_drift_detected",
        "last_check_at",
    )
    list_filter = ("status", "parser_drift_detected")
    readonly_fields = tuple(f.name for f in SourceHealth._meta.fields)


@admin.register(SourceHealthLog)
class SourceHealthLogAdmin(admin.ModelAdmin):
    list_display = ("source", "checked_at", "origin", "endpoint", "success", "latency_ms", "status_code", "error_class")
    list_filter = ("source", "origin", "success", "endpoint")
    search_fields = ("error_class", "error_message")
    date_hierarchy = "checked_at"
