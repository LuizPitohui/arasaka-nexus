"""Cliente HTTP base compartilhado por providers.

Responsabilidades:
- Headers padrão (User-Agent identificável).
- Retry leve com backoff em 5xx/erros de rede.
- Telemetria: cada request gera uma linha em SourceHealthLog (origin=traffic).
- Roteamento opt-in via FlareSolverr para passar Cloudflare IUAM / DDoS-Guard /
  Sucuri e similares. Habilitado quando settings.FLARESOLVERR_URL está
  populado E o provider seta `USE_FLARESOLVERR=True`.

Não implementa rate limit aqui — o MangaDex já tem o seu próprio bucket no
mangadex_client.py, e cada scraper pode definir o seu se precisar.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import requests
from django.conf import settings

logger = logging.getLogger(__name__)


DEFAULT_USER_AGENT = (
    "ArasakaNexus/0.1 (+https://github.com/SEU-USUARIO/arasaka-nexus)"
)


class SourceHTTPError(Exception):
    """Falha de rede/HTTP num provider, normalizada."""

    def __init__(self, message: str, status_code: Optional[int] = None, error_class: str = ""):
        super().__init__(message)
        self.status_code = status_code
        self.error_class = error_class or self.__class__.__name__


class _FakeResponse:
    """Imitação mínima de `requests.Response` retornada pelo FlareSolverr."""

    def __init__(self, status_code: int, text: str, headers: Optional[dict] = None):
        self.status_code = status_code
        self.text = text or ""
        self.content = (text or "").encode("utf-8", errors="replace")
        self.headers = headers or {}
        self.url = ""

    def json(self) -> Any:
        import json as _json
        return _json.loads(self.text)


class BaseHTTPClient:
    """Wrapper fino sobre `requests` que registra telemetria por request."""

    def __init__(
        self,
        source_id: str,
        base_url: str,
        timeout: int = 20,
        user_agent: Optional[str] = None,
        default_headers: Optional[dict] = None,
        max_retries: int = 2,
        use_flaresolverr: bool = False,
    ):
        self.source_id = source_id
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update({"User-Agent": user_agent or DEFAULT_USER_AGENT})
        if default_headers:
            self.session.headers.update(default_headers)
        # FlareSolverr: ativo apenas quando o provider opta + a env está setada.
        self.use_flaresolverr = bool(use_flaresolverr) and bool(
            getattr(settings, "FLARESOLVERR_URL", "")
        )
        self._fs_session_id: Optional[str] = None

    # ------------------------------------------------------------------
    # FlareSolverr proxy (opt-in)
    # ------------------------------------------------------------------
    def _fs_url(self) -> str:
        return getattr(settings, "FLARESOLVERR_URL", "").rstrip("/")

    def _fs_create_session(self) -> Optional[str]:
        """Cria/retorna o id da sessão deste source no FlareSolverr."""
        if self._fs_session_id:
            return self._fs_session_id
        url = self._fs_url()
        if not url:
            return None
        sid = f"nexus-{self.source_id}"
        try:
            r = requests.post(
                url,
                json={"cmd": "sessions.create", "session": sid},
                timeout=30,
            )
            r.raise_for_status()
            self._fs_session_id = sid
            return sid
        except Exception as exc:
            logger.warning("FlareSolverr sessions.create falhou para %s: %s", self.source_id, exc)
            return None

    def _fs_request(self, method: str, url: str, *, params: dict | None, data: dict | None) -> _FakeResponse:
        """Roteia request via FlareSolverr. Sem suporte a json body — só GET/POST form."""
        sid = self._fs_create_session()
        full_url = url
        if params:
            from urllib.parse import urlencode
            sep = "&" if "?" in full_url else "?"
            full_url = f"{full_url}{sep}{urlencode(params)}"

        cmd = "request.get" if method.upper() == "GET" else "request.post"
        payload: dict = {
            "cmd": cmd,
            "url": full_url,
            "maxTimeout": int(self.timeout * 1000),
        }
        if sid:
            payload["session"] = sid
        if cmd == "request.post":
            from urllib.parse import urlencode
            payload["postData"] = urlencode(data or {})

        try:
            r = requests.post(self._fs_url(), json=payload, timeout=self.timeout + 30)
            r.raise_for_status()
            body = r.json()
        except Exception as exc:
            raise SourceHTTPError(f"FlareSolverr proxy error: {exc}", None, "FlareSolverrError")

        if body.get("status") != "ok":
            raise SourceHTTPError(
                f"FlareSolverr returned {body.get('status')}: {body.get('message','')[:200]}",
                None,
                "FlareSolverrFailure",
            )
        sol = body.get("solution") or {}
        return _FakeResponse(
            status_code=int(sol.get("status") or 0),
            text=sol.get("response") or "",
            headers=sol.get("headers") or {},
        )

    # ------------------------------------------------------------------
    # request
    # ------------------------------------------------------------------
    def request(
        self,
        method: str,
        path_or_url: str,
        *,
        endpoint: str,
        params: Optional[dict] = None,
        data: Optional[dict] = None,
        json_body: Optional[dict] = None,
        headers: Optional[dict] = None,
        record_telemetry: bool = True,
    ) -> requests.Response:
        url = path_or_url if path_or_url.startswith("http") else f"{self.base_url}/{path_or_url.lstrip('/')}"
        last_exc: Optional[Exception] = None

        for attempt in range(self.max_retries + 1):
            t0 = time.monotonic()
            status_code: Optional[int] = None
            error_class = ""
            error_message = ""
            success = False
            try:
                if self.use_flaresolverr and method.upper() in ("GET", "POST"):
                    resp = self._fs_request(method, url, params=params, data=data)
                else:
                    resp = self.session.request(
                        method,
                        url,
                        params=params,
                        data=data,
                        json=json_body,
                        headers=headers,
                        timeout=self.timeout,
                    )
                status_code = resp.status_code
                if resp.status_code >= 500:
                    error_class = f"HTTP{resp.status_code}"
                    error_message = f"server error {resp.status_code}"
                    last_exc = SourceHTTPError(error_message, status_code, error_class)
                    if attempt < self.max_retries:
                        time.sleep(min(2 ** attempt, 5))
                        continue
                else:
                    success = resp.status_code < 400
                    return resp
            except requests.Timeout as exc:
                error_class = "Timeout"
                error_message = str(exc)
                last_exc = SourceHTTPError(error_message, None, error_class)
            except requests.ConnectionError as exc:
                error_class = "ConnectionError"
                error_message = str(exc)
                last_exc = SourceHTTPError(error_message, None, error_class)
            except requests.RequestException as exc:
                error_class = exc.__class__.__name__
                error_message = str(exc)
                last_exc = SourceHTTPError(error_message, None, error_class)
            finally:
                if record_telemetry:
                    self._log(
                        endpoint=endpoint,
                        success=success,
                        latency_ms=int((time.monotonic() - t0) * 1000),
                        status_code=status_code,
                        error_class=error_class,
                        error_message=error_message,
                    )

            if attempt < self.max_retries:
                time.sleep(min(2 ** attempt, 5))

        assert last_exc is not None
        raise last_exc

    def get(self, path_or_url: str, *, endpoint: str, **kwargs) -> requests.Response:
        return self.request("GET", path_or_url, endpoint=endpoint, **kwargs)

    def _log(self, **kwargs) -> None:
        """Registra telemetria sem deixar o request principal cair se o DB falhar."""
        try:
            from sources.models import SourceHealthLog

            SourceHealthLog.objects.create(
                source_id=self.source_id,
                origin=SourceHealthLog.ORIGIN_TRAFFIC,
                **kwargs,
            )
        except Exception:  # pragma: no cover — telemetria nunca quebra fluxo
            logger.exception("Falha ao registrar telemetria de %s", self.source_id)
