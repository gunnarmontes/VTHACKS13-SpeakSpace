# mapapp/services/places.py
"""
Thin wrapper around Google Places API v1 used by mapapp.views.
- Accepts either GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY from env.
- Exposes helpers called by your views:
    * text_search_apartments(text_query, page_size=15)
    * nearby_search_apartments(center, radius_m, page_size=15)
    * search_nearby_v1(center, radius_m, included_types=None, max_results=20)
    * details_v1(place_id, fields)
    * normalize_place(p)
    * normalize_v1_place_basic(p)
    * normalize_details_basic(p)
"""

from __future__ import annotations
import os
import httpx

API_ROOT = "https://places.googleapis.com/v1"
TIMEOUT = 20.0

class PlacesError(Exception):
    pass


def _server_key() -> str:
    """
    Prefer GOOGLE_PLACES_KEY; fall back to GOOGLE_MAPS_API_KEY.
    """
    return os.getenv("GOOGLE_PLACES_KEY") or os.getenv("GOOGLE_MAPS_API_KEY") or ""


def _headers() -> dict:
    key = _server_key()
    if not key:
        raise PlacesError("Missing GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY.")
    # You can also use query param ?key=...; header keeps URLs clean
    return {
        "X-Goog-Api-Key": key,
        # Ask only for the fields we need to keep payloads small
        "X-Goog-FieldMask": (
            "places.id,places.displayName,places.formattedAddress,places.location,"
            "places.googleMapsUri,places.websiteUri,places.primaryType,places.types,"
            "places.photos.name,places.rating,places.userRatingCount,"
            "id,displayName,formattedAddress,location,googleMapsUri,websiteUri,"
            "primaryType,types,photos.name,rating,userRatingCount"
        ),
    }


def _client() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT, follow_redirects=True)


# ------------------------- Search helpers -------------------------

ALLOWED_APARTMENT_TYPES = [
    "apartment_complex",
    "property_management_company",
    "real_estate_agency",
]

def text_search_apartments(*, text_query: str, page_size: int = 15) -> list[dict]:
    """
    POST places:searchText filtering to apartments. Text Search expects `includedType` (singular).
    """
    body = {
        "textQuery": text_query,
        "pageSize": max(1, min(int(page_size or 15), 20)),
        "includedType": "apartment_complex",  # <-- singular
        # Optional: "rankPreference": "RELEVANCE",
    }
    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchText", headers=_headers(), json=body)

        # Fallback: if Google still complains about the filter, retry without it
        if r.status_code == 400:
            try:
                msg = r.json().get("error", {}).get("message", "")
            except Exception:
                msg = r.text
            if "Unknown name" in msg or "Cannot find field" in msg:
                body.pop("includedType", None)
                r = c.post(f"{API_ROOT}/places:searchText", headers=_headers(), json=body)

    if r.status_code != 200:
        raise PlacesError(f"searchText failed {r.status_code}: {r.text[:300]}")
    return r.json().get("places") or []



def nearby_search_apartments(center: dict, *, radius_m: int, page_size: int = 15) -> list[dict]:
    """
    POST places:searchNearby with includedTypes restricted to apartment flavors.
    center = {"lat": float, "lng": float}
    """
    lat = float(center["lat"])
    lng = float(center["lng"])
    body = {
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": int(radius_m)}
        },
        "includedTypes": ALLOWED_APARTMENT_TYPES,
        "pageSize": max(1, min(int(page_size or 15), 20)),
    }
    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchNearby", headers=_headers(), json=body)
    if r.status_code != 200:
        raise PlacesError(f"searchNearby failed {r.status_code}: {r.text[:300]}")
    return r.json().get("places") or []


def search_nearby_v1(center: dict, *, radius_m: int, included_types: list[str] | None, max_results: int = 20) -> dict:
    """
    General nearby search used by NearbyAround endpoint.
    Returns the raw API response dict (with 'places': [...]).
    """
    lat = float(center["lat"])
    lng = float(center["lng"])
    body = {
        "locationRestriction": {
            "circle": {"center": {"latitude": lat, "longitude": lng}, "radius": int(radius_m)}
        },
        "pageSize": max(1, min(int(max_results or 20), 20)),
    }
    if included_types:
        body["includedTypes"] = included_types
    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchNearby", headers=_headers(), json=body)
    if r.status_code != 200:
        raise PlacesError(f"searchNearby_v1 failed {r.status_code}: {r.text[:300]}")
    return r.json()


def details_v1(place_id: str, fields: list[str]) -> dict:
    """
    GET places/{place_id}?fields=...
    """
    headers = _headers().copy()
    if fields:
        headers["X-Goog-FieldMask"] = ",".join(fields)
    with _client() as c:
        r = c.get(f"{API_ROOT}/places/{place_id}", headers=headers)
    if r.status_code != 200:
        raise PlacesError(f"details_v1 failed {r.status_code}: {r.text[:300]}")
    return r.json()


# ------------------------- Normalizers -------------------------

def _first_photo_name(p: dict) -> str | None:
    photos = p.get("photos") or []
    if not photos:
        return None
    name = photos[0].get("name")
    return name or None


def normalize_place(p: dict) -> dict:
    """
    Normalize a place result for list cards.
    """
    return {
        "id": p.get("id"),
        "name": (p.get("displayName") or {}).get("text") if isinstance(p.get("displayName"), dict) else p.get("displayName"),
        "address": p.get("formattedAddress"),
        "lat": ((p.get("location") or {}).get("latitude")),
        "lng": ((p.get("location") or {}).get("longitude")),
        "googleMapsUri": p.get("googleMapsUri"),
        "websiteUri": p.get("websiteUri"),
        "primaryType": p.get("primaryType"),
        "types": p.get("types") or [],
        "photoName": _first_photo_name(p),
        "rating": p.get("rating"),
        "userRatingCount": p.get("userRatingCount"),
    }


def normalize_v1_place_basic(p: dict) -> dict:
    """
    Smaller card payload for nearby POIs (not only apartments).
    """
    return {
        "id": p.get("id"),
        "name": (p.get("displayName") or {}).get("text") if isinstance(p.get("displayName"), dict) else p.get("displayName"),
        "address": p.get("formattedAddress"),
        "lat": ((p.get("location") or {}).get("latitude")),
        "lng": ((p.get("location") or {}).get("longitude")),
        "googleMapsUri": p.get("googleMapsUri"),
        "primaryType": p.get("primaryType"),
        "types": p.get("types") or [],
        "photoName": _first_photo_name(p),
    }


def normalize_details_basic(p: dict) -> dict:
    """
    Detail view payload.
    """
    return {
        "id": p.get("id"),
        "name": (p.get("displayName") or {}).get("text") if isinstance(p.get("displayName"), dict) else p.get("displayName"),
        "address": p.get("formattedAddress"),
        "lat": ((p.get("location") or {}).get("latitude")),
        "lng": ((p.get("location") or {}).get("longitude")),
        "googleMapsUri": p.get("googleMapsUri"),
        "websiteUri": p.get("websiteUri"),
        "rating": p.get("rating"),
        "userRatingCount": p.get("userRatingCount"),
        "photoName": _first_photo_name(p),
        "photos": [ph.get("name") for ph in (p.get("photos") or []) if isinstance(ph, dict) and ph.get("name")],
        "types": p.get("types") or [],
        "primaryType": p.get("primaryType"),
    }
