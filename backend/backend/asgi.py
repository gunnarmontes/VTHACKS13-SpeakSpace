# backend/asgi.py
import os
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "backend.settings")

from django.core.asgi import get_asgi_application
django_asgi_app = get_asgi_application()

# Optional Channels wiring (safe if channels is installed)
try:
    from channels.routing import ProtocolTypeRouter, URLRouter
    from channels.auth import AuthMiddlewareStack
    try:
        from voiceagent.routing import websocket_urlpatterns
    except Exception:
        websocket_urlpatterns = []
    application = ProtocolTypeRouter({
        "http": django_asgi_app,
        "websocket": AuthMiddlewareStack(URLRouter(websocket_urlpatterns)),
    })
except Exception:
    # fallback if channels not installed
    application = django_asgi_app
