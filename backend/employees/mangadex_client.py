"""Centralized MangaDex API client.

All outbound calls to MangaDex MUST go through this module so that the documented
rate limits are enforced globally across Celery workers and HTTP request handlers.

Limits enforced:
    - Global: ~5 req/s (we run with a configurable margin, default 4 req/s).
    - GET /at-home/server/{id}: 40 req/min (we use 35 by default).

Behaviors:
    - Token-bucket limiter backed by Redis (atomic Lua script) shared across processes.
    - Custom User-Agent (required by MangaDex's policy).
    - Retry with backoff on connection errors and 5xx; respects ``Retry-After`` on 429.
    - Caches the ``/at-home/server/{id}`` response in Redis (TTL configurable) since
      that endpoint is the most rate-limited and is hit on every page load of the reader.
"""

from __future__ import annotations

import logging
import time
from typing import Any, Optional

import redis
import requests
from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)


class MangaDexError(Exception):
    """Base exception for MangaDex client failures."""


class RateLimitExceeded(MangaDexError):
    """Raised when we cannot acquire a rate-limit token within the deadline."""


# Atomic Redis token bucket. Returns [allowed (0/1), wait_seconds (float as string)].
_LUA_TOKEN_BUCKET = """
local capacity = tonumber(ARGV[1])
local refill_rate = tonumber(ARGV[2])
local now = tonumber(ARGV[3])

local data = redis.call('HMGET', KEYS[1], 'tokens', 'ts')
local tokens = tonumber(data[1])
local ts = tonumber(data[2])

if tokens == nil then
    tokens = capacity
    ts = now
end

local delta = now - ts
if delta < 0 then delta = 0 end

tokens = tokens + delta * refill_rate
if tokens > capacity then tokens = capacity end

local allowed = 0
local wait = 0
if tokens >= 1 then
    tokens = tokens - 1
    allowed = 1
else
    wait = (1 - tokens) / refill_rate
end

redis.call('HMSET', KEYS[1], 'tokens', tokens, 'ts', now)
redis.call('EXPIRE', KEYS[1], 120)

return {allowed, tostring(wait)}
"""


class MangaDexClient:
    GLOBAL_BUCKET_KEY = "mangadex:rl:global"
    AT_HOME_BUCKET_KEY = "mangadex:rl:at_home"
    AT_HOME_CACHE_PREFIX = "mangadex:cache:at_home:"

    def __init__(self):
        self.base_url = settings.MANGADEX_BASE_URL.rstrip("/")
        self.user_agent = settings.MANGADEX_USER_AGENT
        self.timeout = settings.MANGADEX_REQUEST_TIMEOUT
        self.global_rate = float(settings.MANGADEX_GLOBAL_RATE_PER_SECOND)
        self.at_home_rate_per_minute = int(settings.MANGADEX_AT_HOME_RATE_PER_MINUTE)
        self.at_home_cache_ttl = int(settings.MANGADEX_AT_HOME_CACHE_SECONDS)

        self._session = requests.Session()
        self._session.headers.update(
            {
                "User-Agent": self.user_agent,
                "Accept": "application/json",
            }
        )
        self._redis = redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)

    # ------------------------------------------------------------------
    # Rate limiting
    # ------------------------------------------------------------------
    def _acquire(self, key: str, capacity: float, refill_rate: float, max_wait: float = 30.0) -> None:
        deadline = time.monotonic() + max_wait
        while True:
            now = time.time()
            try:
                allowed, wait_s = self._redis.eval(
                    _LUA_TOKEN_BUCKET, 1, key, capacity, refill_rate, now
                )
            except redis.RedisError as exc:
                # Fail open with a conservative sleep so a Redis blip doesn't break imports.
                logger.warning("Redis indisponível para rate limit (%s); sleep 1s e segue", exc)
                time.sleep(1)
                return
            if int(allowed) == 1:
                return
            sleep_for = float(wait_s) + 0.02
            if time.monotonic() + sleep_for > deadline:
                raise RateLimitExceeded(f"Tempo de espera excedido para {key}")
            time.sleep(min(sleep_for, 1.0))

    def _acquire_global(self) -> None:
        self._acquire(
            self.GLOBAL_BUCKET_KEY,
            capacity=max(self.global_rate, 1.0),
            refill_rate=self.global_rate,
        )

    def _acquire_at_home(self) -> None:
        # Capacity = full minute budget; refill at per-second equivalent.
        self._acquire(
            self.AT_HOME_BUCKET_KEY,
            capacity=float(self.at_home_rate_per_minute),
            refill_rate=self.at_home_rate_per_minute / 60.0,
            max_wait=60.0,
        )

    # ------------------------------------------------------------------
    # HTTP plumbing
    # ------------------------------------------------------------------
    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[dict] = None,
        json: Optional[dict] = None,
        max_retries: int = 4,
        skip_global: bool = False,
    ) -> dict[str, Any]:
        url = f"{self.base_url}{path}"
        attempt = 0
        while True:
            attempt += 1
            if not skip_global:
                self._acquire_global()
            try:
                response = self._session.request(
                    method, url, params=params, json=json, timeout=self.timeout
                )
            except requests.RequestException as exc:
                if attempt > max_retries:
                    logger.error("MangaDex %s %s: erro de rede definitivo (%s)", method, path, exc)
                    raise
                backoff = min(60.0, 2 ** attempt)
                logger.warning("MangaDex %s %s falhou (%s); retry em %.1fs", method, path, exc, backoff)
                time.sleep(backoff)
                continue

            status = response.status_code

            if status == 429:
                retry_after = self._parse_retry_after(response)
                if attempt > max_retries:
                    logger.error("MangaDex 429 persistente em %s após %d tentativas", path, attempt)
                    response.raise_for_status()
                logger.warning(
                    "MangaDex 429 em %s; respeitando Retry-After=%.1fs", path, retry_after
                )
                time.sleep(retry_after + 0.5)
                continue

            if 500 <= status < 600:
                if attempt > max_retries:
                    response.raise_for_status()
                backoff = min(60.0, 2 ** attempt)
                logger.warning(
                    "MangaDex %s em %s; retry em %.1fs (tentativa %d)",
                    status,
                    path,
                    backoff,
                    attempt,
                )
                time.sleep(backoff)
                continue

            response.raise_for_status()
            return response.json()

    @staticmethod
    def _parse_retry_after(response: requests.Response) -> float:
        raw = response.headers.get("Retry-After")
        if not raw:
            return 5.0
        try:
            return max(1.0, float(raw))
        except ValueError:
            # HTTP-date format — fall back to a safe default.
            return 10.0

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------
    def list_manga(self, **params) -> dict[str, Any]:
        return self._request("GET", "/manga", params=params)

    def get_manga(self, manga_id: str, **params) -> dict[str, Any]:
        return self._request("GET", f"/manga/{manga_id}", params=params)

    def get_manga_feed(self, manga_id: str, **params) -> dict[str, Any]:
        return self._request("GET", f"/manga/{manga_id}/feed", params=params)

    def get_at_home_server(
        self, chapter_id: str, *, force_refresh: bool = False
    ) -> dict[str, Any]:
        cache_key = f"{self.AT_HOME_CACHE_PREFIX}{chapter_id}"
        if not force_refresh:
            cached = cache.get(cache_key)
            if cached is not None:
                return cached
        # /at-home/server has its own per-minute budget *and* counts toward the global one.
        self._acquire_at_home()
        data = self._request("GET", f"/at-home/server/{chapter_id}")
        cache.set(cache_key, data, self.at_home_cache_ttl)
        return data


_client: Optional[MangaDexClient] = None


def get_client() -> MangaDexClient:
    global _client
    if _client is None:
        _client = MangaDexClient()
    return _client
