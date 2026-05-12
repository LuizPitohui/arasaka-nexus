"""Normalização e matching de títulos pra agrupar variantes de Manga sob
uma ``Work`` canônica.

Estratégia (deliberadamente simples — fuzzy matching cai aqui só se
quisermos pagar custo de embedding / N-gram + DB ext):

1. Normaliza o título via ``normalize_title``: lowercase, sem acentuação,
   sem pontuação, sem artigos iniciais, whitespace colapsado.
2. Usa ``normalized_title`` como chave única em Work.
3. ``attach_work(manga)``: get_or_create por normalized_title; vincula
   o Manga à Work resultante.

Casos felizes cobertos:
  - "Solo Leveling" / "solo leveling" / "Solo  Leveling!" → mesma Work.
  - "The Beginning After the End" / "Beginning After the End" → mesma.
  - "ｓｏｌｏ ｌｅｖｅｌｉｎｇ" (fullwidth) → mesma após NFKD.

Casos que precisarão correção manual (e tem admin pra isso):
  - "Solo Leveling: Ragnarok" (sequência) — fica em Work separada.
  - "Sololeveling" sem espaço — Work separada.

Mismatches devem ser corrigidos no Django admin alterando ``Manga.work``.
"""

from __future__ import annotations

import re
import unicodedata

from django.utils.text import slugify


_PUNCT_RE = re.compile(r"[^\w\s]", re.UNICODE)
_WS_RE = re.compile(r"\s+", re.UNICODE)
# Artigos iniciais em pt/en/es — só os mais comuns pra não excluir títulos
# japoneses transliterados.
_LEADING_ARTICLES_RE = re.compile(
    r"^(the|a|an|o|os|as|um|uma|uns|umas|el|la|los|las|le|les)\s+",
    re.IGNORECASE,
)


def normalize_title(raw: str) -> str:
    """Converte um título humano numa chave canonical, estável e dedupável."""
    if not raw:
        return ""
    # NFKD + remoção de marks: "Café" -> "cafe", "ｓｏｌｏ" -> "solo".
    s = unicodedata.normalize("NFKD", raw)
    s = "".join(c for c in s if not unicodedata.combining(c))
    s = s.lower().strip()
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    s = _LEADING_ARTICLES_RE.sub("", s)
    return s[:240]


def _unique_slug(base: str, work_model) -> str:
    """Slug derivado do título canonical, sufixo numérico se colidir."""
    base_slug = slugify(base)[:200] or "work"
    candidate = base_slug
    suffix = 2
    while work_model.objects.filter(slug=candidate).exists():
        candidate = f"{base_slug}-{suffix}"[:255]
        suffix += 1
        if suffix > 10000:  # paranoia
            from secrets import token_hex
            candidate = f"{base_slug}-{token_hex(4)}"[:255]
            break
    return candidate


def attach_work(manga, *, save: bool = True):
    """Garante que ``manga`` está vinculado a uma ``Work`` canonical.

    - Calcula ``normalized_title`` a partir de ``manga.title``.
    - ``get_or_create`` da Work por essa chave.
    - Atualiza ``manga.work`` quando difere do atual.

    Devolve a Work resolvida (ou ``None`` quando o título normalizado fica
    vazio — improvável, mas defensivo). Idempotente.
    """
    from .models import Work

    norm = normalize_title(manga.title)
    if not norm:
        return None

    work = Work.objects.filter(normalized_title=norm).first()
    if work is None:
        work = Work.objects.create(
            normalized_title=norm,
            canonical_title=manga.title.strip()[:255],
            slug=_unique_slug(manga.title, Work),
        )

    if manga.work_id != work.id:
        manga.work = work
        if save:
            manga.save(update_fields=["work"])

    return work
