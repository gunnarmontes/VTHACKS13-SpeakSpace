"""
Django settings for backend project.
"""

from pathlib import Path
import os
from dotenv import load_dotenv
from datetime import timedelta

# ----------------------------------------------------------------------
# Load environment
# ----------------------------------------------------------------------
BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv()  # loads .env (local) if present

# ----------------------------------------------------------------------
# Core
# ----------------------------------------------------------------------
SECRET_KEY = os.getenv("DJANGO_SECRET_KEY", "django-insecure-development-placeholder")
DEBUG = os.getenv("DEBUG", "False").lower() == "true"

# Hosts / CORS
RENDER_HOST = "vthacks13-speakspace.onrender.com"
VERCEL_HOST = "vthacks13-speakspace.vercel.app"

if DEBUG:
    ALLOWED_HOSTS = ["*", "localhost", "127.0.0.1"]
    CORS_ALLOW_ALL_ORIGINS = True
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]
    CSRF_TRUSTED_ORIGINS = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:8000",
    ]
else:
    # Production: be explicit. We still allow local Vite to call the prod API.
    ALLOWED_HOSTS = [RENDER_HOST, VERCEL_HOST, "localhost", "127.0.0.1"]
    CORS_ALLOW_ALL_ORIGINS = False
    CORS_ALLOWED_ORIGINS = [
        "http://localhost:5173",                        # local Vite → prod API
        f"https://{RENDER_HOST}",                      # (same-origin ok, but harmless)
        f"https://{VERCEL_HOST}",                      # if you ever host FE on Vercel
    ]
    CSRF_TRUSTED_ORIGINS = [
        f"https://{RENDER_HOST}",
        f"https://{VERCEL_HOST}",
    ]

# Behind a proxy (Render/Heroku style)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")

# If you use cookies anywhere (not required for your JWT flows, but safe defaults)
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_SECURE = not DEBUG
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

# ----------------------------------------------------------------------
# External service keys (read from env)
# (Access these directly via os.environ in your app modules.)
# ----------------------------------------------------------------------
# Support either env var name for Google:
os.environ.setdefault(
    "GOOGLE_MAPS_API_KEY",
    os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_KEY", "")
)

# ----------------------------------------------------------------------
# Apps
# ----------------------------------------------------------------------
INSTALLED_APPS = [
    "corsheaders",
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # third-party
    "rest_framework",
    "rest_framework_simplejwt",
    "channels",

    # your apps
    "authapp",
    "mapapp",
    "voiceagent",   # if you still use it
    # if you created these (recommended for tools / voice endpoints):
    "agenttools",
    "agentvoice",
]

MIDDLEWARE = [
    "corsheaders.middleware.CorsMiddleware",  # keep CORS first
    "django.middleware.security.SecurityMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# ----------------------------------------------------------------------
# ASGI / Channels
# ----------------------------------------------------------------------
ASGI_APPLICATION = "backend.asgi.application"
CHANNEL_LAYERS = {
    "default": {"BACKEND": "channels.layers.InMemoryChannelLayer"}
}

# ----------------------------------------------------------------------
# DRF / JWT
# ----------------------------------------------------------------------
REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": [
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ],
    "DEFAULT_PERMISSION_CLASSES": [
        "rest_framework.permissions.AllowAny",  # tighten per-view where needed
    ],
}

SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(minutes=30),
    "REFRESH_TOKEN_LIFETIME": timedelta(days=7),
    "AUTH_HEADER_TYPES": ("Bearer",),
}

# ----------------------------------------------------------------------
# URLs / Templates / WSGI
# ----------------------------------------------------------------------
ROOT_URLCONF = "backend.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

WSGI_APPLICATION = "backend.wsgi.application"

# ----------------------------------------------------------------------
# Database (SQLite for dev; consider Postgres in prod)
# ----------------------------------------------------------------------
DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.sqlite3",
        "NAME": BASE_DIR / "db.sqlite3",
    }
}

# ----------------------------------------------------------------------
# Password validation
# ----------------------------------------------------------------------
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# ----------------------------------------------------------------------
# I18N
# ----------------------------------------------------------------------
LANGUAGE_CODE = "en-us"
TIME_ZONE = "UTC"
USE_I18N = True
USE_TZ = True

# ----------------------------------------------------------------------
# Static files
# ----------------------------------------------------------------------
STATIC_URL = "static/"
STATIC_ROOT = os.path.join(BASE_DIR, "staticfiles")

DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"
