import os
import time
import requests

API_BASE = os.environ.get("ELEVEN_AGENT_SEARCH_BASE_URL", "http://127.0.0.1:8000").rstrip("/")
DEFAULT_TIMEOUT = float(os.environ.get("AGENT_HTTP_TIMEOUT", "12"))
RETRIES = int(os.environ.get("AGENT_HTTP_RETRIES", "2"))
BACKOFF = float(os.environ.get("AGENT_HTTP_BACKOFF", "0.4"))

def _request_with_retry(method: str, path: str, **kwargs) -> requests.Response:
    url = f"{API_BASE}{path}"
    timeout = kwargs.pop("timeout", DEFAULT_TIMEOUT)
    last_err = None
    for attempt in range(RETRIES + 1):
        try:
            return requests.request(method, url, timeout=timeout, **kwargs)
        except requests.RequestException as e:
            last_err = e
            if attempt < RETRIES:
                time.sleep(BACKOFF * (2 ** attempt))
    raise last_err

def api_get(path: str, params=None, timeout: float = DEFAULT_TIMEOUT) -> requests.Response:
    return _request_with_retry("GET", path, params=params or {}, timeout=timeout)

def api_post(path: str, json=None, timeout: float = DEFAULT_TIMEOUT) -> requests.Response:
    return _request_with_retry("POST", path, json=json or {}, timeout=timeout)
