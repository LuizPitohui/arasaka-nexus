"""Tsuki Mangás (https://tsuki-mangas.com).

Catálogo BR top-tier. O frontend Next.js do site consome `/api/v2/` (descoberto
via DevTools, não documentado mas estável há ~2 anos):

  GET /api/v2/mangas/search?title=<q>&page=1
  GET /api/v2/mangas/<id>
  GET /api/v2/chapter/versions/<manga_id>?page=1   capítulos paginados
  GET /api/v2/chapter/versions/<version_id>/pages  páginas de um capítulo

Anti-bot:
- Tsuki adicionou um JS challenge: requests sem UA realista recebem
  pagina HTML "Error. Page cannot be displayed". UA de browser recebe
  uma pagina <script>window.location.replace(...&js=<JWT>)</script> que
  precisa ser seguida pra obter o cookie de sessao.
- A gente faz o "cookie dance" manualmente: se a primeira resposta nao
  for JSON, extrai o ``js=<JWT>`` do redirect e refaz o request — o
  servidor seta cookie de sessao e os requests subsequentes funcionam
  pelo TTL do JWT (~2h pelo iat/exp observados).
- Quando o challenge muda de forma drastica, o provider degrada e o
  health check sinaliza no painel. Refazer com Playwright e trabalho
  futuro se o JS ficar mais complexo.
"""

from __future__ import annotations

import logging
import re
import time
from typing import Optional

from ..base.dto import ChapterDTO, HealthResult, MangaDTO, PageDTO
from ..base.http import BaseHTTPClient, SourceHTTPError
from ..base.source import BaseSource

logger = logging.getLogger(__name__)


# Tsuki blacklist UAs identificaveis (qualquer coisa com "bot" ou nosso
# default "ArasakaNexus/..."). UA de Chrome real recebe o JS challenge,
# que a gente resolve manualmente.
TSUKI_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36"
)

# Regex pra extrair o ``js=<JWT>`` do redirect HTML do challenge.
_TSUKI_CHALLENGE_JS = re.compile(r"window\.location\.replace\('([^']+)'\)")


class TsukiSource(BaseSource):
    id = "tsuki"
    name = "Tsuki Mangás"
    base_url = "https://tsuki-mangas.com"
    languages = ["pt-br"]
    kind = "api"
    # FlareSolverr resolve o JS challenge agressivo que redireciona
    # requests automatizados pra netun-oum (ad-fraud). Sem isso, o
    # provider sempre devolve [] e o health check sinaliza parser_drift.
    USE_FLARESOLVERR = True

    API_BASE = "https://tsuki-mangas.com/api/v2"
    CDN_BASE = "https://cdn.tsuki-mangas.com"

    def __init__(self):
        self.client = BaseHTTPClient(
            source_id=self.id,
            base_url=self.API_BASE,
            user_agent=TSUKI_UA,
            use_flaresolverr=self.USE_FLARESOLVERR,
            default_headers={
                "Accept": "application/json, text/plain, */*",
                "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
                "Origin": self.base_url,
                "Referer": self.base_url + "/",
            },
        )
        # Cookie/sessao do JS challenge — fallback quando FlareSolverr nao
        # esta disponivel (FLARESOLVERR_URL nao setado). Hoje o anti-bot
        # do Tsuki nao resolve so com cookie dance, mas mantemos o handler
        # pra graceful degrade.
        self._challenge_passed = False

    def _solve_challenge(self, html: str) -> bool:
        """Detecta + resolve o JS challenge do Tsuki.

        Espera HTML do shape ``<script>window.location.replace('...&js=<JWT>')</script>``.
        Faz o GET na URL com ``js`` querystring — o servidor seta cookie de
        sessao na requests.Session. Subsequente requests viajam autenticados
        pelo TTL do JWT (~2h).
        """
        match = _TSUKI_CHALLENGE_JS.search(html)
        if not match:
            return False
        challenge_url = match.group(1)
        try:
            # Bypassa o ``BaseHTTPClient.get`` pra nao re-disparar o handler.
            self.client.session.get(challenge_url, timeout=15)
            self._challenge_passed = True
            return True
        except Exception as exc:
            logger.warning("tsuki challenge solve failed: %s", exc)
            return False

    def _get_json(self, path: str, *, endpoint: str, params: dict | None = None,
                  record_telemetry: bool = True) -> dict | list:
        """GET wrapper resiliente ao anti-bot do Tsuki.

        Tenta parse JSON do response.text mesmo sem content-type=json
        (FlareSolverr captura o body com o Chrome — devolve HTML wrappado
        do JSON tipo ``<html><body><pre>{"data":[...]}</pre>...``). A
        gente extrai o JSON do meio se necessario.

        Fallback: se nao for JSON, tenta resolver o challenge classico via
        cookie dance e re-pede uma vez.
        """
        import json as _json
        import re as _re

        def _try_parse(text: str):
            if not text:
                return None
            # 1. Tenta parse direto
            try:
                return _json.loads(text)
            except (ValueError, TypeError):
                pass
            # 2. FlareSolverr wrappa em <html>...<pre>JSON</pre>... — extrai
            m = _re.search(r"<pre[^>]*>(.*?)</pre>", text, _re.DOTALL)
            if m:
                try:
                    return _json.loads(m.group(1).strip())
                except (ValueError, TypeError):
                    pass
            # 3. Tenta substring entre primeiro { e ultimo } (ou [ ])
            for open_ch, close_ch in (("{", "}"), ("[", "]")):
                start = text.find(open_ch)
                end = text.rfind(close_ch)
                if 0 <= start < end:
                    try:
                        return _json.loads(text[start : end + 1])
                    except (ValueError, TypeError):
                        continue
            return None

        for attempt in range(2):
            try:
                resp = self.client.get(
                    path, endpoint=endpoint, params=params,
                    record_telemetry=record_telemetry,
                )
            except SourceHTTPError:
                return {}
            parsed = _try_parse(resp.text)
            if parsed is not None:
                return parsed
            # Body nao-JSON: tenta challenge dance e re-pede uma vez
            if attempt == 0 and self._solve_challenge(resp.text):
                continue
            return {}
        return {}

    # ---------- search & detail ----------

    def search(self, query: str, page: int = 1) -> list[MangaDTO]:
        payload = self._get_json(
            "/mangas/search", endpoint="search",
            params={"title": query, "page": page},
        )
        if isinstance(payload, list):
            items = payload
        else:
            items = payload.get("data") or payload.get("mangas") or []
            if isinstance(items, dict):
                items = items.get("data", [])
        return [self._to_manga_dto(m) for m in items if isinstance(m, dict)]

    def fetch_manga(self, external_id: str) -> MangaDTO:
        data = self._get_json(f"/mangas/{external_id}", endpoint="manga")
        if not data:
            return MangaDTO(external_id=external_id, title="(não encontrado)")
        return self._to_manga_dto(data if isinstance(data, dict) else {})

    # ---------- chapters ----------

    def fetch_chapters(self, external_id: str, language: Optional[str] = None) -> list[ChapterDTO]:
        out: list[ChapterDTO] = []
        page = 1
        while page <= 50:
            payload = self._get_json(
                f"/chapter/versions/{external_id}",
                endpoint="chapters", params={"page": page},
            )
            items = payload.get("data") or [] if isinstance(payload, dict) else []
            if not items:
                break
            for ch in items:
                dto = self._to_chapter_dto(ch)
                if dto:
                    out.append(dto)
            if len(items) < 30:
                break
            page += 1
        return out

    # ---------- pages ----------

    def fetch_pages(self, chapter_external_id: str) -> list[PageDTO]:
        payload = self._get_json(
            f"/chapter/versions/{chapter_external_id}/pages", endpoint="pages",
        )
        items = payload if isinstance(payload, list) else (payload.get("pages") or payload.get("data") or [])
        out: list[PageDTO] = []
        for i, p in enumerate(items):
            if isinstance(p, str):
                url = p
            else:
                url = p.get("url") or p.get("image") or p.get("src") or ""
                if url and not url.startswith("http"):
                    url = f"{self.CDN_BASE}/{url.lstrip('/')}"
            if url:
                out.append(PageDTO(index=i, url=url, headers={"Referer": self.base_url + "/"}))
        return out

    # ---------- health ----------

    def healthcheck(self) -> HealthResult:
        t0 = time.monotonic()
        payload = self._get_json(
            "/mangas/search", endpoint="healthcheck",
            params={"title": "naruto", "page": 1},
            record_telemetry=False,
        )
        latency = int((time.monotonic() - t0) * 1000)
        items = payload.get("data") if isinstance(payload, dict) else payload
        count = len(items) if isinstance(items, list) else 0
        # _get_json devolve {} em falha (challenge nao-resolvido, 5xx, etc).
        # Success = conseguimos extrair pelo menos uma entrada — confirma
        # que o JS challenge foi resolvido E o catalogo respondeu.
        return HealthResult(
            success=count > 0,
            latency_ms=latency,
            status_code=200 if count > 0 else 0,
            extracted_count=count,
            error_class="parser_drift" if count == 0 else None,
            error_message=(
                "Sem itens extraidos — possivel anti-bot ou shape mudou"
                if count == 0 else None
            ),
        )

    # ---------- DTO mapping ----------

    def _to_manga_dto(self, item: dict) -> MangaDTO:
        mid = str(item.get("id") or item.get("manga_id") or "")
        title = item.get("title") or item.get("name") or "(sem título)"
        cover = item.get("poster") or item.get("cover") or ""
        if cover and not cover.startswith("http"):
            cover = f"{self.CDN_BASE}/{cover.lstrip('/')}"
        status_raw = (item.get("status") or "").lower()
        status_map = {
            "ativo": "ongoing", "em lançamento": "ongoing",
            "completo": "completed", "completed": "completed", "finalizado": "completed",
            "hiato": "hiatus", "pausado": "hiatus",
        }
        status = status_map.get(status_raw, "")
        return MangaDTO(
            external_id=mid,
            title=title,
            url=f"{self.base_url}/obra/{mid}/{item.get('url') or ''}".rstrip("/"),
            cover_url=cover,
            description=item.get("synopsis") or item.get("description") or "",
            author=item.get("author") or "",
            artist=item.get("artist") or "",
            status=status,
            languages=["pt-br"],
        )

    def _to_chapter_dto(self, ch: dict) -> Optional[ChapterDTO]:
        cid = str(ch.get("id") or ch.get("version_id") or "")
        if not cid:
            return None
        try:
            number = float(ch.get("number") or ch.get("chapter") or 0)
        except (TypeError, ValueError):
            number = 0.0
        return ChapterDTO(
            external_id=cid,
            number=number,
            title=ch.get("title") or "",
            language="pt-br",
            scanlator=ch.get("scan") or ch.get("group") or "",
            url=ch.get("url") or "",
        )
