"""HTTP views.

The HTTP layer never blocks waiting for MangaDex. Anything that requires an
upstream call gets dispatched to Celery; reads served to the user are backed
by the local database (with the rate-limited reader endpoint cached in Redis
inside the client).
"""

from __future__ import annotations

import logging

from django.conf import settings
from django.core.cache import cache
from django.db.models import Count, F, Max, OuterRef, Q, Subquery
from django.db.models.functions import Greatest
from django.shortcuts import get_object_or_404
from rest_framework import permissions, status, viewsets
from rest_framework.decorators import action, api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework.throttling import UserRateThrottle

# Content ratings always shown publicly (SFW). Adult ratings are gated behind
# both age verification (Profile.birthdate >= 18) and an explicit opt-in
# (Profile.show_adult = True).
SAFE_RATINGS = ("safe", "suggestive")
ADULT_RATINGS = ("erotica", "pornographic")


def _user_can_see_adult(request) -> bool:
    if not request.user.is_authenticated:
        return False
    profile = getattr(request.user, "profile", None)
    if not profile:
        return False
    return profile.is_adult and profile.show_adult


def _filter_adult_qs(request, qs):
    """Hide adult-rated mangás unless the user has opted-in and is verified."""
    if _user_can_see_adult(request):
        return qs
    return qs.filter(content_rating__in=SAFE_RATINGS)


def _dedupe_by_work(qs):
    """Filtra ``qs`` pra incluir apenas a melhor variante de cada Work.

    "Melhor" = maior count de capitulos importados, tiebreaker pela
    atividade mais recente (Greatest(published_at, release_date)), com
    -id como ultimo desempate determinístico.

    Mangas sem ``work_id`` (recem-importados antes do matcher canonico
    rodar, ou unicos) passam direto. Pra mangas com ``work_id``, mantem
    so o id que satisfaz a subquery do best-variant.

    Uso: filtrar listagens (popular, latest, search, browse) pra mostrar
    UMA card por Work em vez de 3 variantes redundantes vindas de fontes
    diferentes. Aplicar SEMPRE antes de paginate_queryset — dedup pos-
    paginacao quebra contagem e gera paginas desbalanceadas.
    """
    # Import dentro da funcao porque _dedupe_by_work é definido antes do
    # `from .models import Manga` no topo do arquivo (ordem historica).
    from .models import Manga

    best_per_work = (
        Manga.objects.filter(work_id=OuterRef("work_id"), is_active=True)
        .annotate(
            _cap_count=Count("chapters"),
            _latest_at=Max(
                Greatest("chapters__published_at", "chapters__release_date")
            ),
        )
        .order_by("-_cap_count", F("_latest_at").desc(nulls_last=True), "-id")
        .values("id")[:1]
    )
    return qs.filter(Q(work__isnull=True) | Q(id=Subquery(best_per_work)))

# Cache key for individual manga detail responses. TTL conservador porque
# chapter_count muda quando o feed sync importa caps novos — invalidacao
# manual via perform_update/perform_destroy garante consistencia em writes
# do admin, mas o TTL serve de upper bound pra feeds em background.
MANGA_DETAIL_CACHE_TTL = 180
MANGA_DETAIL_CACHE_KEY = "manga:detail:{id}"

# Categorias/generos sao quase-imutaveis (so admin altera). Cache mais
# longo reduz queries repetidas em quem usa o filter sidebar.
CATEGORY_LIST_CACHE_TTL = 600  # 10 min
CATEGORY_LIST_CACHE_KEY = "categories:with_counts"


class SearchThrottle(UserRateThrottle):
    """Throttles ``search`` reading the rate from ``DEFAULT_THROTTLE_RATES['search']``."""

    scope = "search"


class ImportThrottle(UserRateThrottle):
    scope = "import"

from .models import Category, Chapter, ChapterImage, Manga
from .serializers import (
    CategorySerializer,
    ChapterDetailSerializer,
    ChapterImageSerializer,
    ChapterListSerializer,
    MangaDetailSerializer,
    MangaListSerializer,
)
from .mangadex_client import get_client
from .services import get_mangadex_pages
from .tasks import task_import_manga_chapters, task_import_mihon_manga, task_seed_initial_library

logger = logging.getLogger(__name__)


# ----------------------------------------------------------------------
# ViewSets
# ----------------------------------------------------------------------
class IsAdminOrReadOnly(permissions.BasePermission):
    def has_permission(self, request, view):
        if request.method in permissions.SAFE_METHODS:
            return True
        return bool(request.user and request.user.is_staff)


class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all().order_by("name")
    serializer_class = CategorySerializer
    permission_classes = [IsAdminOrReadOnly]

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def with_counts(self, request):
        """Returns every category annotated with how many active mangás use it.

        Cacheado em Redis por ``CATEGORY_LIST_CACHE_TTL`` — payload muda
        raramente (so quando admin renomeia/cria categoria), entao 10min
        absorve quase todos os hits dos filtros de browse/genres.
        """
        cached = cache.get(CATEGORY_LIST_CACHE_KEY)
        if cached is not None:
            return Response(cached)

        cats = (
            Category.objects.annotate(
                manga_count=Count("mangas", filter=Q(mangas__is_active=True), distinct=True)
            )
            .filter(manga_count__gt=0)
            .order_by("-manga_count", "name")
        )
        data = [
            {
                "id": c.id,
                "name": c.name,
                "slug": c.slug,
                "manga_count": c.manga_count,
            }
            for c in cats
        ]
        cache.set(CATEGORY_LIST_CACHE_KEY, data, CATEGORY_LIST_CACHE_TTL)
        return Response(data)


VALID_ORDERINGS = {
    "recent": "-id",
    "alphabetical": "title",
    "alphabetical_desc": "-title",
    "popular": "-favorites_count",
    "latest_chapter": "-latest_chapter_at",
    "oldest": "id",
}


class MangaViewSet(viewsets.ModelViewSet):
    queryset = Manga.objects.filter(is_active=True).prefetch_related("categories").order_by("-id")
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.action == "list":
            return MangaListSerializer
        return MangaDetailSerializer

    def retrieve(self, request, *args, **kwargs):
        # Short cache (60s) — cuts repeated detail loads when a user opens
        # several chapters in a row from the same page. Cache is keyed by pk
        # only (not user) but we re-verify the adult gate before serving so
        # cached adult metadata never leaks to non-adult users.
        from django.http import Http404

        pk = kwargs.get("pk")
        cache_key = MANGA_DETAIL_CACHE_KEY.format(id=pk)
        cached = cache.get(cache_key)
        if cached is not None:
            rating = cached.get("content_rating")
            if rating in ADULT_RATINGS and not _user_can_see_adult(request):
                raise Http404
            return Response(cached)
        response = super().retrieve(request, *args, **kwargs)
        if response.status_code == 200:
            cache.set(cache_key, response.data, MANGA_DETAIL_CACHE_TTL)
        return response

    def perform_update(self, serializer):
        super().perform_update(serializer)
        cache.delete(MANGA_DETAIL_CACHE_KEY.format(id=serializer.instance.id))

    def perform_destroy(self, instance):
        cache.delete(MANGA_DETAIL_CACHE_KEY.format(id=instance.id))
        super().perform_destroy(instance)

    def get_queryset(self):
        qs = Manga.objects.filter(is_active=True).prefetch_related("categories")
        qs = _filter_adult_qs(self.request, qs)

        params = self.request.query_params

        genres = params.getlist("genre")
        if genres:
            for slug in genres:
                qs = qs.filter(categories__slug=slug)
            qs = qs.distinct()

        status_param = params.get("status")
        if status_param:
            qs = qs.filter(status=status_param.upper())

        title = params.get("title")
        if title:
            qs = qs.filter(title__icontains=title)

        # Annotations only when needed
        ordering = params.get("ordering", "recent")
        if ordering in {"popular"}:
            qs = qs.annotate(favorites_count=Count("favorited_by", distinct=True))
        if ordering in {"latest_chapter"}:
            # Greatest(published_at, release_date) por capitulo: pega a data
            # mais recente entre publicacao real upstream e insercao no nosso
            # DB. Garante que tanto novos chapters quanto recem-importados
            # subam pro topo, e mangas estagnados afundem naturalmente.
            # release_date e auto_now_add (nunca null), entao GREATEST nunca
            # retorna NULL.
            qs = qs.annotate(
                latest_chapter_at=Max(
                    Greatest("chapters__published_at", "chapters__release_date")
                )
            )

        order_expr = VALID_ORDERINGS.get(ordering, "-id")
        qs = qs.order_by(order_expr)
        # Dedup por Work: uma card por obra canonica, mesmo que existam
        # variantes de fontes diferentes. UI fica sem duplicatas em browse,
        # genres, filtros etc.
        return _dedupe_by_work(qs)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def popular(self, request):
        qs = (
            Manga.objects.filter(is_active=True)
            .annotate(favorites_count=Count("favorited_by", distinct=True))
            .prefetch_related("categories")
            .order_by("-favorites_count", "-id")
        )
        qs = _filter_adult_qs(request, qs)
        qs = _dedupe_by_work(qs)
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = MangaListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(MangaListSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def latest(self, request):
        # Greatest(published_at, release_date): pega a "atividade mais recente"
        # de cada capitulo (publicacao real upstream OU insercao no nosso DB,
        # o que for maior). Mangas com cap novo sobem porque published_at sobe;
        # mangas recem-importados sobem porque release_date sobe; mangas
        # estagnados ficam na sua data verdadeira de ultima atividade.
        qs = (
            Manga.objects.filter(is_active=True)
            .annotate(
                latest_chapter_at=Max(
                    Greatest("chapters__published_at", "chapters__release_date")
                )
            )
            .filter(latest_chapter_at__isnull=False)
            .prefetch_related("categories")
            # Tiebreaker `-id` evita paginação não-determinística quando dois
            # mangás compartilham o mesmo `latest_chapter_at` (ou null). Sem
            # ele, o Postgres pode retornar a mesma linha em páginas
            # diferentes — bug observado em /latest (páginas 21-30 repetindo).
            .order_by("-latest_chapter_at", "-id")
        )
        qs = _filter_adult_qs(request, qs)
        qs = _dedupe_by_work(qs)
        page = self.paginate_queryset(qs)
        if page is not None:
            serializer = MangaListSerializer(page, many=True)
            return self.get_paginated_response(serializer.data)
        return Response(MangaListSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"], permission_classes=[AllowAny])
    def random(self, request):
        manga = (
            _filter_adult_qs(request, Manga.objects.filter(is_active=True))
            .order_by("?")
            .first()
        )
        if not manga:
            return Response({"detail": "Sem mangás disponíveis."}, status=404)
        return Response(MangaDetailSerializer(manga).data)


class ChapterViewSet(viewsets.ModelViewSet):
    queryset = Chapter.objects.all().select_related("manga").order_by("-number")
    permission_classes = [IsAdminOrReadOnly]

    def get_serializer_class(self):
        if self.action == "retrieve":
            return ChapterDetailSerializer
        return ChapterListSerializer

    def get_queryset(self):
        queryset = super().get_queryset()
        # Defense-in-depth: o gate de adulto e aplicado no nivel de manga.
        # Se o usuario nao pode ver mangas adultos, escondemos os capitulos
        # deles aqui tambem (alem do MangaViewSet ja filtrar). Garantia
        # adicional contra IDOR enumerando manga_id em /api/chapters/.
        if not _user_can_see_adult(self.request):
            queryset = queryset.filter(manga__content_rating__in=SAFE_RATINGS)
        manga_id = self.request.query_params.get("manga")
        if manga_id is not None:
            queryset = queryset.filter(manga_id=manga_id)
        lang = (self.request.query_params.get("lang") or "").strip().lower()
        if lang:
            queryset = queryset.filter(translated_language=lang)
        return queryset

    def paginate_queryset(self, queryset):
        # ?paginated=false ou ?paginated=0 → entrega tudo de uma vez. Ainda
        # exigimos um filtro por mangá para nao despejar 50k linhas em um
        # request anonimo. Util para a pagina de detalhe que mostra todos
        # os capitulos com filtro local por idioma/numero.
        flag = (self.request.query_params.get("paginated") or "").lower()
        manga_id = self.request.query_params.get("manga")
        if flag in ("0", "false", "no", "off") and manga_id:
            return None
        return super().paginate_queryset(queryset)


@api_view(["GET"])
@permission_classes([AllowAny])
def chapter_languages(request):
    """Returns the list of translated languages available for a given manga.

    Resposta: [{"code": "pt-br", "count": 842}, {"code": "en", "count": 520}, ...]
    Ordenado por count desc — frontend usa pra montar tabs e escolher default.
    """
    from django.db.models import Count

    manga_id = request.query_params.get("manga")
    if not manga_id:
        return Response([])
    rows = (
        Chapter.objects.filter(manga_id=manga_id)
        .exclude(translated_language="")
        .values("translated_language")
        .annotate(count=Count("id"))
        .order_by("-count")
    )
    return Response(
        [{"code": r["translated_language"], "count": r["count"]} for r in rows]
    )


# ----------------------------------------------------------------------
# Reader (chapter pages + navigation)
# ----------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def get_chapter_pages(request, chapter_id: int):
    from django.http import Http404 as _Http404

    chapter = get_object_or_404(Chapter.objects.select_related("manga"), id=chapter_id)

    # Defense-in-depth: bloqueia leitura de capitulos de mangas adultos para
    # usuarios sem verificacao 18+ ou opt-in. MangaViewSet.retrieve ja faz
    # isso, mas /api/read/<id>/ e endpoint independente — nao podemos confiar
    # no gate da pagina anterior.
    if (
        chapter.manga.content_rating in ADULT_RATINGS
        and not _user_can_see_adult(request)
    ):
        raise _Http404("not found")

    # Mantemos o usuario na mesma lingua ao avancar/voltar capitulo. Quando a
    # lingua atual eh desconhecida (registros antigos sem translated_language),
    # caímos para listar todos para nao quebrar a navegacao.
    siblings_qs = Chapter.objects.filter(manga_id=chapter.manga_id)
    if chapter.translated_language:
        siblings_qs = siblings_qs.filter(translated_language=chapter.translated_language)
    siblings = list(siblings_qs.order_by("number").values_list("id", flat=True))
    try:
        idx = siblings.index(chapter.id)
    except ValueError:
        idx = 0
    prev_chapter_id = siblings[idx - 1] if idx > 0 else None
    next_chapter_id = siblings[idx + 1] if idx < len(siblings) - 1 else None

    # ?refresh=1 bypasses our /at-home/server cache. Reader uses this when a
    # page 404s (MangaDex baseUrl tokens expire ~15min after issuance).
    force_refresh = request.query_params.get("refresh") in ("1", "true", "yes")

    pages: list = []
    source = "LOCAL"
    local_images = ChapterImage.objects.filter(chapter=chapter).order_by("order")
    if local_images.exists():
        pages = ChapterImageSerializer(local_images, many=True).data
    elif chapter.source_id == "mihon":
        # Mihon flow: paginas vem do Suwayomi sob demanda. URLs sao proxiadas
        # via /api/cdn/mihon/<chapter_id>/<page_index>/ pra:
        #   1. Cloudflare cachear no edge (24h por (chapter,page))
        #   2. Esconder o Suwayomi interno do publico
        from sources import registry as sources_registry

        src_mihon = sources_registry.get("mihon")
        if src_mihon and getattr(src_mihon, "is_configured", False):
            source = "MIHON_STREAM"
            # Tira o prefixo "mihon:" pra obter o chapterId interno do Suwayomi.
            external_id = chapter.mangadex_id or ""
            inner_chapter_id = external_id[len("mihon:"):] if external_id.startswith("mihon:") else external_id
            try:
                page_dtos = src_mihon.fetch_pages(inner_chapter_id)
            except Exception:
                page_dtos = []
            pages = [
                {
                    "id": p.index,
                    "image": f"/api/cdn/mihon/{chapter.id}/{p.index}/",
                    "image_saver": None,
                    "order": p.index,
                }
                for p in page_dtos
            ]
    elif chapter.mangadex_id:
        source = "MANGADEX_STREAM"
        pages = get_mangadex_pages(
            chapter.mangadex_id,
            force_refresh=force_refresh,
            chapter_id=chapter.id,
        )

    return Response(
        {
            "source": source,
            "manga_id": chapter.manga_id,
            "manga_title": chapter.manga.title,
            "chapter_number": chapter.number,
            "title": chapter.title,
            "translated_language": chapter.translated_language or "",
            "pages": pages,
            "navigation": {"prev": prev_chapter_id, "next": next_chapter_id},
        }
    )


# ----------------------------------------------------------------------
# CDN proxy — streams MangaDex@Home images through our origin so users
# whose ISP/Cloudflare blocks *.mangadex.network still see pages. Cloudflare
# in front caches each (chapter_id, index) tuple after the first request.
# ----------------------------------------------------------------------
import requests as _requests
from django.http import Http404, HttpResponse, StreamingHttpResponse


def _build_page_url(chapter_id: int, page_index: int, *, saver: bool, force_refresh: bool = False) -> str | None:
    chapter = Chapter.objects.filter(id=chapter_id).only("mangadex_id").first()
    if not chapter or not chapter.mangadex_id:
        return None
    try:
        data = get_client().get_at_home_server(chapter.mangadex_id, force_refresh=force_refresh)
    except Exception:
        return None
    base_url = data.get("baseUrl")
    ch = data.get("chapter") or {}
    chapter_hash = ch.get("hash")
    files = ch.get("dataSaver" if saver else "data") or []
    if not (base_url and chapter_hash) or page_index >= len(files):
        return None
    kind = "data-saver" if saver else "data"
    return f"{base_url}/{kind}/{chapter_hash}/{files[page_index]}"


# Allowlist de hosts que aceitamos proxiar via /api/cdn/preview/. Evita
# que o endpoint vire um SSRF aberto.
_PREVIEW_ALLOWED_HOSTS = {
    "uploads.mangadex.org",
    "mangadex.org",
}


def _is_safe_upstream_url(url: str, expected_prefix: str) -> bool:
    """Defesa em profundidade contra SSRF nos proxies Mihon.

    Mesmo que o Suwayomi esteja no nosso compose interno, validamos que a
    URL retornada por ele aponta exatamente para a base esperada
    (settings.SUWAYOMI_URL) — nao pra metadados de cloud (169.254.x),
    loopback de outro processo, ou ranges privados arbitrarios.

    expected_prefix deve ser settings.SUWAYOMI_URL (ja stripped de '/').
    """
    if not url or not expected_prefix:
        return False
    # Aceita exatamente prefix + '/' + qualquer path. Bloqueia
    # 'http://suwayomi.evil.com' que comecaria com prefix sem o '/'.
    return url.startswith(expected_prefix + "/")


@api_view(["GET"])
@permission_classes([AllowAny])
def proxy_cover_preview(request):
    """Stream uma imagem de uploads.mangadex.org via nossa origem.

    Usado para capas-preview de buscas live (mangás ainda não importados).
    Cloudflare cacheia por 24h, hits subsequentes não tocam o origin.
    """
    from urllib.parse import urlparse

    src = request.query_params.get("u") or ""
    if not src:
        raise Http404("missing url")
    try:
        parsed = urlparse(src)
    except Exception:
        raise Http404("invalid url")
    if parsed.scheme not in ("http", "https") or parsed.hostname not in _PREVIEW_ALLOWED_HOSTS:
        raise Http404("disallowed host")

    try:
        r = _requests.get(
            src,
            timeout=15,
            stream=True,
            headers={
                "User-Agent": getattr(get_client(), "user_agent", "ArasakaNexus/0.1"),
                "Referer": "https://mangadex.org/",
            },
        )
    except Exception as exc:
        logger.warning("preview proxy fetch failed (%s): %s", src, exc)
        raise Http404("upstream unavailable")

    if r.status_code != 200:
        r.close()
        return HttpResponse(status=r.status_code)

    content_type = r.headers.get("Content-Type", "image/jpeg")
    response = StreamingHttpResponse(
        r.iter_content(chunk_size=32 * 1024),
        content_type=content_type,
    )
    response["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
    if cl := r.headers.get("Content-Length"):
        response["Content-Length"] = cl
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def proxy_mihon_cover(request, external_id: str):
    """Stream thumbnail Mihon (Suwayomi interno → cliente público).

    URL pública: /api/cdn/mihon-cover/<inner>:<mid>/
    Resolve internamente pra http://suwayomi:4567/api/v1/manga/<mid>/thumbnail.
    """
    from sources import registry as sources_registry

    src_mihon = sources_registry.get("mihon")
    if not src_mihon or not getattr(src_mihon, "is_configured", False):
        raise Http404("mihon not configured")

    if ":" not in external_id:
        raise Http404("invalid external_id")
    _, mid = external_id.split(":", 1)
    try:
        int(mid)
    except (TypeError, ValueError):
        raise Http404("invalid manga id")

    upstream_url = f"{src_mihon.base_url}/api/v1/manga/{mid}/thumbnail"

    # SSRF defense: URL e construida a partir de src_mihon.base_url
    # (= settings.SUWAYOMI_URL). Validamos pra blindar caso a base seja
    # alterada em runtime de forma indevida.
    expected = (settings.SUWAYOMI_URL or "").rstrip("/")
    if not _is_safe_upstream_url(upstream_url, expected):
        raise Http404("invalid upstream")

    try:
        r = _requests.get(upstream_url, timeout=15, stream=True)
    except Exception as exc:
        logger.warning("mihon cover proxy falhou (%s): %s", upstream_url, exc)
        raise Http404("upstream unavailable")

    if r.status_code != 200:
        r.close()
        return HttpResponse(status=r.status_code)

    content_type = r.headers.get("Content-Type", "image/jpeg")
    response = StreamingHttpResponse(
        r.iter_content(chunk_size=32 * 1024),
        content_type=content_type,
    )
    # Cover muda raramente — Cloudflare cacheia agressivo.
    response["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=2592000"
    if cl := r.headers.get("Content-Length"):
        response["Content-Length"] = cl
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def proxy_mihon_image(request, chapter_id: int, page_index: int):
    """Stream uma página de capítulo Mihon via Suwayomi.

    Mesmo padrão do `proxy_chapter_image` (MangaDex): pega URL fresca,
    streama via StreamingHttpResponse, headers de cache pro Cloudflare
    cachear no edge.

    Defense-in-depth: bloqueia paginas de mangas adultos pra usuarios sem
    verificacao 18+ — caso atacante consiga chapter_id valido, nao serve as
    imagens.
    """
    from sources import registry as sources_registry

    chapter = (
        Chapter.objects.filter(id=chapter_id, source_id="mihon")
        .select_related("manga")
        .only("mangadex_id", "manga__content_rating")
        .first()
    )
    if not chapter or not chapter.mangadex_id:
        raise Http404("chapter not found")
    if (
        chapter.manga.content_rating in ADULT_RATINGS
        and not _user_can_see_adult(request)
    ):
        raise Http404("not found")

    src_mihon = sources_registry.get("mihon")
    if not src_mihon or not getattr(src_mihon, "is_configured", False):
        raise Http404("mihon not configured")

    inner_chapter_id = chapter.mangadex_id
    if inner_chapter_id.startswith("mihon:"):
        inner_chapter_id = inner_chapter_id[len("mihon:"):]

    try:
        pages = src_mihon.fetch_pages(inner_chapter_id)
    except Exception as exc:
        logger.warning("mihon proxy fetch_pages falhou: %s", exc)
        raise Http404("upstream unavailable")

    if page_index >= len(pages):
        raise Http404("page out of range")

    url = pages[page_index].url
    page_headers = pages[page_index].headers or {}

    # SSRF defense-in-depth: a URL DEVE apontar exatamente pro Suwayomi
    # configurado. Caso o proprio Suwayomi seja comprometido e devolva
    # uma URL apontando pra metadados de cloud (169.254.169.254), bloqueia.
    expected = (settings.SUWAYOMI_URL or "").rstrip("/")
    if not _is_safe_upstream_url(url, expected):
        logger.warning("mihon proxy: URL suspeita rejeitada: %s", url[:200])
        raise Http404("invalid upstream")

    try:
        r = _requests.get(url, timeout=30, stream=True, headers=page_headers)
    except Exception as exc:
        logger.warning("mihon proxy stream falhou (%s): %s", url, exc)
        raise Http404("upstream unavailable")

    if r.status_code != 200:
        r.close()
        return HttpResponse(status=r.status_code)

    content_type = r.headers.get("Content-Type", "image/jpeg")
    response = StreamingHttpResponse(
        r.iter_content(chunk_size=64 * 1024),
        content_type=content_type,
    )
    response["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
    if cl := r.headers.get("Content-Length"):
        response["Content-Length"] = cl
    return response


@api_view(["GET"])
@permission_classes([AllowAny])
def proxy_chapter_image(request, chapter_id: int, page_index: int):
    """Stream a single page through our origin. Falls back to dataSaver on 404.

    Defense-in-depth: bloqueia paginas de mangas adultos pra usuarios sem
    verificacao 18+ — caso atacante enumere chapter_id, nao serve as imagens.
    """
    chapter_meta = (
        Chapter.objects.filter(id=chapter_id)
        .select_related("manga")
        .only("manga__content_rating")
        .first()
    )
    if chapter_meta and (
        chapter_meta.manga.content_rating in ADULT_RATINGS
        and not _user_can_see_adult(request)
    ):
        raise Http404("not found")

    def _fetch(saver: bool, force_refresh: bool = False):
        url = _build_page_url(chapter_id, page_index, saver=saver, force_refresh=force_refresh)
        if not url:
            return None, None
        try:
            r = _requests.get(
                url,
                timeout=20,
                stream=True,
                headers={
                    "User-Agent": getattr(get_client(), "user_agent", "ArasakaNexus/0.1"),
                    "Referer": "https://mangadex.org/",
                },
            )
        except Exception as exc:
            logger.warning("proxy fetch failed (%s saver=%s): %s", url, saver, exc)
            return None, None
        return r, url

    # Try 1: data
    r, _u = _fetch(saver=False)
    # Try 2: dataSaver
    if r is None or r.status_code == 404:
        if r is not None:
            r.close()
        r, _u = _fetch(saver=True)
    # Try 3: force_refresh + data
    if r is None or r.status_code == 404:
        if r is not None:
            r.close()
        r, _u = _fetch(saver=False, force_refresh=True) if False else (None, None)
        # we keep this branch off since baseUrl rarely changes; saver fallback above is the meaningful one

    if r is None:
        raise Http404("upstream unavailable")
    if r.status_code != 200:
        r.close()
        return HttpResponse(status=r.status_code)

    content_type = r.headers.get("Content-Type", "image/jpeg")
    response = StreamingHttpResponse(
        r.iter_content(chunk_size=64 * 1024),
        content_type=content_type,
    )
    # Cloudflare-friendly headers — page bytes are immutable per (chapter, index)
    # because chapter hashes don't change for a published chapter.
    response["Cache-Control"] = "public, max-age=86400, stale-while-revalidate=604800"
    if cl := r.headers.get("Content-Length"):
        response["Content-Length"] = cl
    return response


# ----------------------------------------------------------------------
# Search (hybrid: local + multi-source via registry)
# ----------------------------------------------------------------------
# Local catalogue is queried first; only when it has fewer than this many hits
# do we fan out to external sources (each has its own rate budget; the registry
# runs them in parallel and skips any flagged DOWN by the health subsystem).
LOCAL_FIRST_THRESHOLD = 8
LOCAL_LIMIT = 12


@api_view(["GET"])
@permission_classes([AllowAny])
def work_sources(request, work_id: int):
    """Lista as variantes (Manga) de uma Work, ordenadas pela mais
    completa (mais capítulos). UI usa pra montar o source switcher.
    """
    from django.db.models import Count, Max

    from .models import Work

    work = Work.objects.filter(id=work_id).first()
    if work is None:
        return Response({"detail": "Work não encontrada."}, status=404)

    variants = (
        Manga.objects.filter(work=work, is_active=True)
        .annotate(
            _chapter_count=Count("chapters", distinct=True),
            _latest_at=Max("chapters__published_at"),
        )
        .order_by("-_chapter_count", "id")
    )
    return Response(
        {
            "id": work.id,
            "canonical_title": work.canonical_title,
            "slug": work.slug,
            "sources": [
                {
                    "id": m.id,
                    "source_id": m.source_id,
                    "title": m.title,
                    "cover": m.cover_url,
                    "chapter_count": getattr(m, "_chapter_count", 0) or 0,
                    "latest_at": getattr(m, "_latest_at", None).isoformat()
                    if getattr(m, "_latest_at", None)
                    else None,
                }
                for m in variants
            ],
        }
    )


@api_view(["GET"])
@permission_classes([AllowAny])
@throttle_classes([SearchThrottle])
def search_mangas(request):
    query = (request.query_params.get("q") or "").strip()
    if not query:
        return Response([])

    # Dedup por Work canonical: o usuário busca "Solo Leveling" e recebe
    # UMA variante em vez de 3 (MangaDex + Mihon + MangaPlus). Pega a
    # MELHOR variante por Work (mais capitulos, atividade mais recente).
    base_qs = _filter_adult_qs(
        request, Manga.objects.filter(title__icontains=query, is_active=True)
    )
    deduped_qs = _dedupe_by_work(base_qs).order_by("-id")[:LOCAL_LIMIT]
    local_qs = list(deduped_qs)

    # Pra excluir do upstream lookup, precisamos dos mangadex_ids de TODAS
    # as variantes ja indexadas localmente — nao so das que sobreviveram ao
    # dedup. Caso contrario o multi_source_search devolveria duplicatas.
    all_dex_ids = set(
        base_qs.exclude(mangadex_id__isnull=True)
        .exclude(mangadex_id="")
        .values_list("mangadex_id", flat=True)
    )

    results = [
        {
            "id": m.id,
            "title": m.title,
            "cover": m.cover_url,
            "mangadex_id": m.mangadex_id,
            "in_library": True,
            "source": "local",
            "work_id": m.work_id,
            # work_sources_count vem da contagem de variantes do Work canonico
            # no catalogo local. Frontend mostra badge "N FONTES" quando >= 2.
            "work_sources_count": (
                Manga.objects.filter(work_id=m.work_id, is_active=True).count()
                if m.work_id
                else 1
            ),
        }
        for m in local_qs
    ]

    # Only consult external sources when the local catalogue is weak — keeps
    # upstream search budgets free for genuinely unknown titles.
    if len(query) > 2 and len(local_qs) < LOCAL_FIRST_THRESHOLD:
        from sources.search import multi_source_search

        external_results = multi_source_search(query, exclude_dex_ids=all_dex_ids)
        results.extend(external_results)

    # Agrupa o resultado FINAL (locais + externos) por titulo normalizado.
    # Scanlators diferentes do Mihon servem a mesma obra com o mesmo titulo,
    # e as vezes uma variante ja esta no DB local + externos disponiveis pra
    # importar. Mantem locais como representantes (source=local tem
    # prioridade) e popula work_sources_count com o tamanho do grupo.
    results = _group_search_results(results)

    return Response(results)


def _group_search_results(items: list[dict]) -> list[dict]:
    """Agrupa resultados de busca (locais + externos) por titulo normalizado.

    Cada grupo vira 1 representante (preferindo ``source == 'local'`` quando
    presente — UX prioriza obras ja no catalogo). work_sources_count vira o
    tamanho do grupo. Carrega ``variants`` com metadata das outras fontes
    pra futura UI de switcher de import.
    """
    import re
    import unicodedata

    def _norm(s: str) -> str:
        s = (s or "").strip().lower()
        # remove diacriticos
        s = "".join(
            c for c in unicodedata.normalize("NFKD", s) if not unicodedata.combining(c)
        )
        # remove pontuacao e collapse spaces
        s = re.sub(r"[^\w\s]", " ", s)
        return re.sub(r"\s+", " ", s).strip()

    buckets: dict[str, list[dict]] = {}
    order: list[str] = []
    for it in items:
        key = _norm(it.get("title") or "")
        if not key:
            # mantem itens sem titulo sem agrupar
            order.append(f"__noname_{len(order)}")
            buckets[order[-1]] = [it]
            continue
        if key not in buckets:
            buckets[key] = []
            order.append(key)
        buckets[key].append(it)

    out: list[dict] = []
    for key in order:
        group = buckets[key]
        # Prefere o item com source='local' como representante (obras ja
        # importadas viram clicar-pra-ler direto, em vez de re-importar).
        local_item = next((it for it in group if it.get("source") == "local"), None)
        head = dict(local_item if local_item else group[0])
        # work_sources_count combina o que ja existia (variantes locais do
        # Work canonical) com o total do grupo agrupado por titulo.
        head["work_sources_count"] = max(head.get("work_sources_count") or 1, len(group))
        if len(group) > 1:
            head["variants"] = [
                {
                    "source": v.get("source"),
                    "sub_source": v.get("sub_source"),
                    "external_id": v.get("external_id"),
                    "id": v.get("id"),
                    "cover": v.get("cover"),
                }
                for v in group
            ]
        out.append(head)
    return out


# ----------------------------------------------------------------------
# Async import (dispatches Celery task)
# ----------------------------------------------------------------------
@api_view(["POST"])
@permission_classes([IsAuthenticated])
@throttle_classes([ImportThrottle])
def import_manga(request):
    """Dispatch import por fonte. Aceita:

    - {"mangadex_id": "abc-uuid"}  → import classico MangaDex
    - {"source": "mihon", "external_id": "<inner>:<mid>"} → import via Suwayomi

    O fluxo Mihon roda sincrono (rapido) porque o Suwayomi ja tem metadados
    em memoria. O do MangaDex segue assincrono via Celery.
    """
    payload = request.data or {}
    source = (payload.get("source") or "mangadex").lower()

    # ----------------- MIHON -----------------
    if source == "mihon":
        from sources import registry as sources_registry
        from .tasks import _persist_mihon_manga

        external_id = payload.get("external_id") or payload.get("id") or ""
        if not external_id or ":" not in external_id:
            return Response(
                {"error": "external_id obrigatorio no formato '<inner>:<mid>'"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        storage_id = f"mihon:{external_id}"
        existing = Manga.objects.filter(mangadex_id=storage_id, source_id="mihon").first()
        if existing:
            # Re-sync em background — frontend ja tem manga_id, navega na hora.
            task_import_mihon_manga.delay(external_id)
            return Response(
                {
                    "status": "processing",
                    "manga_id": existing.id,
                    "created": False,
                    "message": "Atualizacao agendada.",
                },
                status=status.HTTP_202_ACCEPTED,
            )

        # Primeiro import — sincrono APENAS metadados, com timeout curto pra
        # nao prender worker gunicorn. Capitulos via Celery em background.
        # Isso isola o request HTTP do tempo de fetch_chapters (que pode
        # demorar segundos pra obras com muitos capitulos).
        src_mihon = sources_registry.get("mihon")
        if src_mihon is None or not getattr(src_mihon, "is_configured", False):
            return Response(
                {"error": "mihon-not-configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        try:
            manga_dto = src_mihon.fetch_manga(external_id, timeout=5)
        except Exception:
            logger.exception("import_manga: fetch_manga sync falhou para %s", external_id)
            return Response(
                {"error": "upstream-slow"},
                status=status.HTTP_504_GATEWAY_TIMEOUT,
            )
        if not manga_dto or not manga_dto.title or manga_dto.title in (
            "(id inválido)", "(não encontrado)"
        ):
            return Response(
                {"error": "not-found", "external_id": external_id},
                status=status.HTTP_404_NOT_FOUND,
            )

        # Persiste so metadados — rapido, em ms (single INSERT).
        manga, created, _ = _persist_mihon_manga(manga_dto, fetch_chapters_for=None)
        # Dispara task assincrona pra puxar capitulos. Nao bloqueia.
        task_import_mihon_manga.delay(external_id)

        return Response(
            {
                "status": "ok",
                "manga_id": manga.id,
                "created": created,
                "chapters_pending": True,
                "message": "Metadados importados; capitulos chegando em background.",
            },
            status=status.HTTP_201_CREATED,
        )

    # ----------------- MANGADEX (default) -----------------
    dex_id = payload.get("mangadex_id") or payload.get("external_id")
    if not dex_id:
        return Response(
            {"error": "mangadex_id é obrigatório"}, status=status.HTTP_400_BAD_REQUEST
        )

    existing = Manga.objects.filter(mangadex_id=dex_id, source_id="mangadex").first()
    task = task_import_manga_chapters.delay(dex_id)

    return Response(
        {
            "status": "processing",
            "task_id": task.id,
            "message": (
                "Mangá já existe. Atualização agendada."
                if existing
                else "Importação iniciada em background."
            ),
            "manga_id": existing.id if existing else None,
            "created": existing is None,
        },
        status=status.HTTP_202_ACCEPTED,
    )


# ----------------------------------------------------------------------
# Home (vitrine) — never blocks on MangaDex
# ----------------------------------------------------------------------
@api_view(["GET"])
@permission_classes([AllowAny])
def home_content(request):
    """Return featured + recent mangás. Never makes upstream calls.

    The first time the database is empty, we *dispatch* a background task to
    seed the library — the response just signals ``seeding=True`` so the UI
    can show a loading state.
    """
    total = Manga.objects.filter(is_active=True).count()
    seeding = False
    if total < 5:
        # Fire-and-forget; the task itself uses a Redis lock to avoid duplicates.
        task_seed_initial_library.delay()
        seeding = True

    base_qs = _filter_adult_qs(
        request,
        Manga.objects.filter(is_active=True).prefetch_related("categories"),
    )

    featured = list(base_qs.order_by("-id")[:10])
    recent = list(base_qs.order_by("-created_at")[:10])

    return Response(
        {
            "seeding": seeding,
            "total": total,
            "featured": [
                {
                    "id": m.id,
                    "title": m.title,
                    "cover": m.cover_url,
                    "categories": [c.name for c in m.categories.all()[:3]],
                }
                for m in featured
            ],
            "recent": [
                {
                    "id": m.id,
                    "title": m.title,
                    "cover": m.cover_url,
                    "status": m.status,
                }
                for m in recent
            ],
        }
    )
