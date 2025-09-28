# mapapp/services/places.py
from __future__ import annotations
import os
import httpx

API_ROOT = "https://places.googleapis.com/v1"
TIMEOUT = 20.0


class PlacesError(Exception):
    pass


def _server_key() -> str:
    key = os.getenv("GOOGLE_PLACES_KEY") or os.getenv("GOOGLE_MAPS_API_KEY") or ""
    if not key:
        raise PlacesError("Missing GOOGLE_PLACES_KEY or GOOGLE_MAPS_API_KEY.")
    return key


def _client() -> httpx.Client:
    return httpx.Client(timeout=TIMEOUT, follow_redirects=True)


def _auth_headers() -> dict:
    return {"X-Goog-Api-Key": _server_key()}


# ------------------------- Search helpers -------------------------

ALLOWED_APARTMENT_TYPES = [
    "apartment_complex",
    "property_management_company",
    "real_estate_agency",
]

# Field mask for search (list responses: 'places.*')
SEARCH_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.googleMapsUri",
    "places.websiteUri",
    "places.primaryType",
    "places.types",
    "places.photos.name",
    "places.rating",
    "places.userRatingCount",
])


def text_search_apartments(*, text_query: str, page_size: int = 15) -> list[dict]:
    """
    POST places:searchText. NOTE: uses `includedType` (singular) when filtering.
    """
    headers = {**_auth_headers(), "X-Goog-FieldMask": SEARCH_FIELD_MASK}
    body = {
        "textQuery": text_query,
        "pageSize": max(1, min(int(page_size or 15), 20)),
        "includedType": "apartment_complex",  # singular for searchText
    }

    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchText", headers=headers, json=body)

        # Fallback if filter not accepted by this project/region
        if r.status_code == 400:
            try:
                msg = r.json().get("error", {}).get("message", "")
            except Exception:
                msg = r.text
            if "Invalid JSON payload" in msg or "Unknown name" in msg or "INVALID_ARGUMENT" in msg:
                body.pop("includedType", None)
                r = c.post(f"{API_ROOT}/places:searchText", headers=headers, json=body)

    if r.status_code != 200:
        raise PlacesError(f"searchText failed {r.status_code}: {r.text[:300]}")
    return r.json().get("places") or []


def nearby_search_apartments(center: dict, *, radius_m: int, page_size: int = 15) -> list[dict]:
    """
    POST places:searchNearby with apartment-related includedTypes.
    center = {"lat": float, "lng": float}
    """
    headers = {**_auth_headers(), "X-Goog-FieldMask": SEARCH_FIELD_MASK}
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
        r = c.post(f"{API_ROOT}/places:searchNearby", headers=headers, json=body)
    if r.status_code != 200:
        raise PlacesError(f"searchNearby failed {r.status_code}: {r.text[:300]}")
    return r.json().get("places") or []


def search_nearby_v1(center: dict, *, radius_m: int, included_types: list[str] | None, max_results: int = 20) -> dict:
    """
    General nearby search used by NearbyAround endpoint.
    Returns response dict with key 'places'.
    """
    headers = {**_auth_headers(), "X-Goog-FieldMask": SEARCH_FIELD_MASK}
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
        r = c.post(f"{API_ROOT}/places:searchNearby", headers=headers, json=body)
    if r.status_code != 200:
        raise PlacesError(f"searchNearby_v1 failed {r.status_code}: {r.text[:300]}")
    return r.json()


# ------------------------- Details -------------------------

def details_v1(place_id: str, fields: list[str]) -> dict:
    """
    GET places/{place_id}. Field mask here is for a single Place (no 'places.' prefix).
    """
    headers = _auth_headers()
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
    return photos[0].get("name") or None


def _name_text(val):
    if isinstance(val, dict):
        return val.get("text")
    return val


def normalize_place(p: dict) -> dict:
    return {
        "id": p.get("id"),
        "name": _name_text(p.get("displayName")),
        "address": p.get("formattedAddress"),
        "lat": (p.get("location") or {}).get("latitude"),
        "lng": (p.get("location") or {}).get("longitude"),
        "googleMapsUri": p.get("googleMapsUri"),
        "websiteUri": p.get("websiteUri"),
        "primaryType": p.get("primaryType"),
        "types": p.get("types") or [],
        "photoName": _first_photo_name(p),
        "rating": p.get("rating"),
        "userRatingCount": p.get("userRatingCount"),
    }


def normalize_v1_place_basic(p: dict) -> dict:
    return {
        "id": p.get("id"),
        "name": _name_text(p.get("displayName")),
        "address": p.get("formattedAddress"),
        "lat": (p.get("location") or {}).get("latitude"),
        "lng": (p.get("location") or {}).get("longitude"),
        "googleMapsUri": p.get("googleMapsUri"),
        "primaryType": p.get("primaryType"),
        "types": p.get("types") or [],
        "photoName": _first_photo_name(p),
    }


def normalize_details_basic(p: dict) -> dict:
    return {
        "id": p.get("id"),
        "name": _name_text(p.get("displayName")),
        "address": p.get("formattedAddress"),
        "lat": (p.get("location") or {}).get("latitude"),
        "lng": (p.get("location") or {}).get("longitude"),
        "googleMapsUri": p.get("googleMapsUri"),
        "websiteUri": p.get("websiteUri"),
        "rating": p.get("rating"),
        "userRatingCount": p.get("userRatingCount"),
        "photoName": _first_photo_name(p),
        "photos": [ph.get("name") for ph in (p.get("photos") or []) if isinstance(ph, dict) and ph.get("name")],
        "types": p.get("types") or [],
        "primaryType": p.get("primaryType"),
    }
