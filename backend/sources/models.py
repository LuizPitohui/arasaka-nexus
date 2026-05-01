"""Modelos do app `sources`.

Estrutura conceitual:

    Source              fonte externa (mangadex, lermanga, comick, ...)
      └─ SourceManga    edição de uma obra numa fonte específica
            └─ SourceChapter
      └─ SourceHealth   resumo atual de saúde (1:1 com Source)
      └─ SourceHealthLog  histórico bruto de probes/telemetria

A obra canônica (Work) ficará no app `library` (rename futuro de `employees`).
Por ora `SourceManga` aponta para `employees.Manga` via FK opcional, para que
a primeira fonte (MangaDex) consiga conviver com o que já existe.
"""

from __future__ import annotations

from django.db import models
from django.utils import timezone


class Source(models.Model):
    """Fonte externa (API ou scraper) cadastrada no sistema."""

    KIND_CHOICES = [
        ("api", "API"),
        ("scraper", "Scraper"),
        ("hybrid", "Híbrido"),
    ]

    id = models.SlugField(primary_key=True, max_length=64)
    name = models.CharField(max_length=120)
    kind = models.CharField(max_length=16, choices=KIND_CHOICES, default="scraper")
    base_url = models.URLField(max_length=300)
    languages = models.JSONField(default=list, help_text="Lista de códigos de idioma, ex: ['pt-br', 'en']")
    is_active = models.BooleanField(default=True, db_index=True)
    priority = models.IntegerField(default=100, help_text="Menor = mais prioritário no fallback do leitor")
    notes = models.TextField(blank=True, default="")

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["priority", "name"]

    def __str__(self) -> str:
        return f"{self.name} ({self.id})"


class SourceManga(models.Model):
    """Vínculo entre uma obra e uma fonte específica.

    `external_id` é o identificador no domínio da fonte (uuid no MangaDex,
    slug no Lermanga, etc.).
    """

    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="mangas")
    # Vínculo com a obra "canônica" no catálogo local (legado em employees.Manga).
    # Mantido como FK opcional para permitir backfill incremental.
    manga = models.ForeignKey(
        "employees.Manga",
        on_delete=models.CASCADE,
        related_name="source_links",
        null=True,
        blank=True,
    )
    external_id = models.CharField(max_length=200, db_index=True)
    title_at_source = models.CharField(max_length=255, blank=True, default="")
    cover_at_source = models.URLField(max_length=600, blank=True, default="")
    language = models.CharField(max_length=10, blank=True, default="", db_index=True)
    url = models.URLField(max_length=600, blank=True, default="")
    last_synced_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("source", "external_id")]
        indexes = [models.Index(fields=["source", "language"])]

    def __str__(self) -> str:
        return f"[{self.source_id}] {self.title_at_source or self.external_id}"


class SourceChapter(models.Model):
    """Capítulo descoberto numa fonte, ainda não necessariamente baixado."""

    source_manga = models.ForeignKey(SourceManga, on_delete=models.CASCADE, related_name="source_chapters")
    external_id = models.CharField(max_length=200, db_index=True)
    number = models.DecimalField(max_digits=8, decimal_places=2)
    title = models.CharField(max_length=255, blank=True, default="")
    language = models.CharField(max_length=10, blank=True, default="", db_index=True)
    scanlator = models.CharField(max_length=200, blank=True, default="")
    url = models.URLField(max_length=600, blank=True, default="")
    published_at = models.DateTimeField(null=True, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        unique_together = [("source_manga", "external_id")]
        ordering = ["-number"]

    def __str__(self) -> str:
        return f"{self.source_manga} cap.{self.number}"


class SourceHealth(models.Model):
    """Resumo da saúde atual de uma fonte (1:1)."""

    STATUS_UP = "UP"
    STATUS_DEGRADED = "DEGRADED"
    STATUS_DOWN = "DOWN"
    STATUS_UNKNOWN = "UNKNOWN"
    STATUS_CHOICES = [
        (STATUS_UP, "Operacional"),
        (STATUS_DEGRADED, "Degradado"),
        (STATUS_DOWN, "Fora do ar"),
        (STATUS_UNKNOWN, "Desconhecido"),
    ]

    source = models.OneToOneField(Source, on_delete=models.CASCADE, related_name="health", primary_key=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default=STATUS_UNKNOWN)
    last_check_at = models.DateTimeField(null=True, blank=True)
    last_success_at = models.DateTimeField(null=True, blank=True)
    last_failure_at = models.DateTimeField(null=True, blank=True)
    # Início da janela de indisponibilidade contínua. Usado pelo painel para
    # mostrar "fora do ar há X horas". Limpo quando volta ao ar.
    down_since = models.DateTimeField(null=True, blank=True)
    consecutive_failures = models.IntegerField(default=0)
    avg_latency_ms_5m = models.IntegerField(default=0)
    p95_latency_ms_5m = models.IntegerField(default=0)
    error_rate_5m = models.FloatField(default=0.0)
    last_error_class = models.CharField(max_length=80, blank=True, default="")
    last_error_message = models.TextField(blank=True, default="")
    # Quando o probe consegue HTTP 200 mas o parser não extrai nada,
    # isso é "drift" — sinal forte de que o site mudou de HTML.
    parser_drift_detected = models.BooleanField(default=False)

    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return f"{self.source_id}: {self.status}"

    @property
    def down_for_seconds(self) -> int:
        if not self.down_since:
            return 0
        return int((timezone.now() - self.down_since).total_seconds())


class SourceHealthLog(models.Model):
    """Telemetria bruta — uma linha por probe ou por request real."""

    ORIGIN_PROBE = "probe"
    ORIGIN_TRAFFIC = "traffic"
    ORIGIN_CHOICES = [
        (ORIGIN_PROBE, "Probe ativo"),
        (ORIGIN_TRAFFIC, "Tráfego real"),
    ]

    source = models.ForeignKey(Source, on_delete=models.CASCADE, related_name="health_logs")
    checked_at = models.DateTimeField(default=timezone.now, db_index=True)
    origin = models.CharField(max_length=16, choices=ORIGIN_CHOICES, default=ORIGIN_PROBE)
    endpoint = models.CharField(max_length=64, help_text="search, manga, chapters, pages...")
    success = models.BooleanField()
    latency_ms = models.IntegerField()
    status_code = models.IntegerField(null=True, blank=True)
    error_class = models.CharField(max_length=80, blank=True, default="")
    error_message = models.TextField(blank=True, default="")
    extracted_count = models.IntegerField(
        null=True,
        blank=True,
        help_text="Número de itens parseados (para detectar parser drift em scrapers)",
    )

    class Meta:
        indexes = [
            models.Index(fields=["source", "-checked_at"]),
            models.Index(fields=["source", "success", "-checked_at"]),
        ]
        ordering = ["-checked_at"]

    def __str__(self) -> str:
        flag = "OK" if self.success else "FAIL"
        return f"[{self.source_id}/{self.endpoint}] {flag} {self.latency_ms}ms"
