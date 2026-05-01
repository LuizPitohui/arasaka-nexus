from pathlib import Path
import os
from datetime import timedelta

BASE_DIR = Path(__file__).resolve().parent.parent


def _env_bool(name: str, default: bool = False) -> bool:
    return os.environ.get(name, str(default)).lower() in ("1", "true", "yes", "on")


def _env_list(name: str, default: str = "") -> list[str]:
    raw = os.environ.get(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


SECRET_KEY = os.environ.get("DJANGO_SECRET_KEY")
if not SECRET_KEY:
    raise RuntimeError(
        "DJANGO_SECRET_KEY is required. Set it in the .env file. "
        "Generate one with: python -c 'from django.core.management.utils import get_random_secret_key; print(get_random_secret_key())'"
    )

DEBUG = _env_bool("DJANGO_DEBUG", default=False)

ALLOWED_HOSTS = _env_list("DJANGO_ALLOWED_HOSTS", "localhost,127.0.0.1")


INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "rest_framework_simplejwt.token_blacklist",
    "corsheaders",
    "django_celery_results",
    "employees",
    "accounts",
    "site_config",
    "sources",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

ROOT_URLCONF = "config.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "config.wsgi.application"

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": os.environ.get("DB_NAME"),
        "USER": os.environ.get("DB_USER"),
        "PASSWORD": os.environ.get("DB_PASSWORD"),
        "HOST": os.environ.get("DB_HOST", "db"),
        "PORT": os.environ.get("DB_PORT", "5432"),
    }
}

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 8}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "pt-br"
TIME_ZONE = os.environ.get("DJANGO_TIME_ZONE", "America/Manaus")
USE_I18N = True
USE_TZ = True

STATIC_URL = "static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

MEDIA_URL = "/media/"
MEDIA_ROOT = os.path.join(BASE_DIR, "media")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

CORS_ALLOWED_ORIGINS = _env_list(
    "DJANGO_CORS_ALLOWED_ORIGINS",
    "http://localhost:3000,http://127.0.0.1:3000",
)
CORS_ALLOW_CREDENTIALS = True

# --- Hardening em produção ---
if not DEBUG:
    SECURE_BROWSER_XSS_FILTER = True
    SECURE_CONTENT_TYPE_NOSNIFF = True
    X_FRAME_OPTIONS = "DENY"
    SECURE_SSL_REDIRECT = _env_bool("DJANGO_SECURE_SSL_REDIRECT", default=True)
    SESSION_COOKIE_SECURE = True
    CSRF_COOKIE_SECURE = True
    SECURE_HSTS_SECONDS = int(os.environ.get("DJANGO_HSTS_SECONDS", "31536000"))
    SECURE_HSTS_INCLUDE_SUBDOMAINS = True
    SECURE_HSTS_PRELOAD = True
    SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# --- DRF ---
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ),
    "DEFAULT_PAGINATION_CLASS": "rest_framework.pagination.PageNumberPagination",
    "PAGE_SIZE": 24,
    "DEFAULT_THROTTLE_CLASSES": (
        "rest_framework.throttling.AnonRateThrottle",
        "rest_framework.throttling.UserRateThrottle",
        "rest_framework.throttling.ScopedRateThrottle",
    ),
    "DEFAULT_THROTTLE_RATES": {
        # Generous defaults so casual navigation never trips throttle.
        # Search/import stay tighter because they touch MangaDex (rate-limited upstream).
        "anon": "200/min",
        "user": "1200/min",
        "search": "30/min",
        "import": "10/min",
    },
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=int(os.environ.get("JWT_ACCESS_MINUTES", "30"))),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=int(os.environ.get("JWT_REFRESH_DAYS", "7"))),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": True,
    "AUTH_HEADER_TYPES": ("Bearer",),
    "UPDATE_LAST_LOGIN": True,
}

# --- Celery ---
CELERY_BROKER_URL = os.environ.get("CELERY_BROKER_URL", "redis://redis:6379/0")
CELERY_RESULT_BACKEND = os.environ.get("CELERY_RESULT_BACKEND", "redis://redis:6379/0")
CELERY_ACCEPT_CONTENT = ["json"]
CELERY_TASK_SERIALIZER = "json"
CELERY_RESULT_SERIALIZER = "json"
CELERY_TIMEZONE = TIME_ZONE
CELERY_TASK_ACKS_LATE = True
CELERY_TASK_REJECT_ON_WORKER_LOST = True

# --- Celery Beat (periodic tasks) ---
# Hardcoded schedule kept in code (no extra DB-backed scheduler) so that
# everything is reproducible from the repo and survives container rebuilds.
from celery.schedules import crontab  # noqa: E402

CELERY_BEAT_SCHEDULE = {
    "refresh-popular-mangas": {
        "task": "employees.scheduled_refresh_popular",
        "schedule": crontab(minute=0),  # every hour, on the hour
    },
    "sync-followed-feeds": {
        "task": "employees.scheduled_sync_followed_feeds",
        # every 6 hours at xx:15 to spread load away from the hourly job
        "schedule": crontab(minute=15, hour="*/6"),
    },
    "mirror-covers": {
        "task": "employees.scheduled_mirror_covers",
        # every 30min: enqueues up to 100 cover downloads per run
        "schedule": crontab(minute="*/30"),
    },
    "cleanup-old-pages": {
        "task": "employees.scheduled_cleanup_old_pages",
        # daily 03:30 — frees disk for chapter pages older than 30 days
        # whose users haven't touched them. Only mirrors actively used.
        "schedule": crontab(minute=30, hour=3),
    },
    "cleanup-orphan-mangas": {
        "task": "employees.scheduled_cleanup_orphans",
        "schedule": crontab(minute=30, hour=4),  # daily 04:30 local
    },
    "sources-healthcheck": {
        "task": "sources.healthcheck_all",
        # A cada minuto. Cada fonte tem seu próprio espaçamento interno;
        # essa task só dispara probes para as que estão "vencidas".
        "schedule": crontab(minute="*"),
    },
}

# Storage limits for the on-demand page mirror
PAGE_MIRROR_TTL_DAYS = int(os.environ.get("PAGE_MIRROR_TTL_DAYS", "30"))

# --- Cache (Redis) ---
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/1")
CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": REDIS_URL,
        "TIMEOUT": 300,
    }
}

# --- MangaDex client ---
MANGADEX_BASE_URL = os.environ.get("MANGADEX_BASE_URL", "https://api.mangadex.org")
MANGADEX_USER_AGENT = os.environ.get(
    "MANGADEX_USER_AGENT",
    "ArasakaNexus/0.1 (+https://github.com/SEU-USUARIO/arasaka-nexus)",
)
# Mantém abaixo dos 5 req/s globais para ter folga
MANGADEX_GLOBAL_RATE_PER_SECOND = float(os.environ.get("MANGADEX_GLOBAL_RATE_PER_SECOND", "4"))
# /at-home/server tem teto de 40/min — usamos 35 para folga
MANGADEX_AT_HOME_RATE_PER_MINUTE = int(os.environ.get("MANGADEX_AT_HOME_RATE_PER_MINUTE", "35"))
# Tokens MangaDex no baseUrl expiram ~15min apos emissao. Cacheamos por 8min
# para garantir que usuarios que pegam URL no fim do TTL ainda tenham 7min
# de validade. Se estourar (raro), o reader chama ?refresh=1 e reissue.
MANGADEX_AT_HOME_CACHE_SECONDS = int(os.environ.get("MANGADEX_AT_HOME_CACHE_SECONDS", "480"))
MANGADEX_REQUEST_TIMEOUT = int(os.environ.get("MANGADEX_REQUEST_TIMEOUT", "20"))

# --- Sources (multi-fonte) ---
# IDs habilitados em runtime. Cada um precisa estar mapeado em
# `sources.registry.PROVIDER_MAP`. Pode ser sobrescrito via env var
# (CSV: "lermanga,goldenmangas").
SOURCES_ENABLED = _env_list("SOURCES_ENABLED", "mangadex,comick")
# Intervalo mínimo entre probes ativos por fonte (em segundos).
SOURCES_HEALTHCHECK_INTERVAL_SECONDS = int(
    os.environ.get("SOURCES_HEALTHCHECK_INTERVAL_SECONDS", "300")
)

# --- Logging ---
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "standard": {
            "format": "[{asctime}] {levelname} {name}: {message}",
            "style": "{",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "standard",
        },
    },
    "root": {
        "handlers": ["console"],
        "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO"),
    },
    "loggers": {
        "employees": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
        "sources": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}
