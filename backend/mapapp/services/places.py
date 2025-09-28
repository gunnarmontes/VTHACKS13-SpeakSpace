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

# ------------------------- Field masks -------------------------
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

GEOCODE_FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.location",
    "places.primaryType",
    "places.types",
])

DETAILS_FIELD_MASK_BASE = ",".join([
    "id","displayName","formattedAddress","location",
    "googleMapsUri","websiteUri","rating","userRatingCount","photos",
])

# ------------------------- Helpers -------------------------

ALLOWED_APARTMENT_TYPES = [
    "apartment_complex",
    "property_management_company",
    "real_estate_agency",
    # sometimes google returns these:
    "apartment", "apartment_building", "apartment_rental_agency", "condominium_complex",
]

LOCALITY_TYPES = {
    "locality", "postal_code", "administrative_area_level_3",
    "administrative_area_level_2", "administrative_area_level_1",
}

def text_search_apartments(*, text_query: str, page_size: int = 15) -> list[dict]:
    headers = {**_auth_headers(), "X-Goog-FieldMask": SEARCH_FIELD_MASK}
    body = {
        "textQuery": text_query,
        "pageSize": max(1, min(int(page_size or 15), 20)),
        "includedType": "apartment_complex",  # singular for searchText
    }
    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchText", headers=headers, json=body)
        if r.status_code == 400:
            # Retry without filter if project/region rejects includedType on text search
            body.pop("includedType", None)
            r = c.post(f"{API_ROOT}/places:searchText", headers=headers, json=body)
    if r.status_code != 200:
        raise PlacesError(f"searchText failed {r.status_code}: {r.text[:300]}")
    return r.json().get("places") or []

def geocode_center(text_query: str) -> tuple[float,float] | None:
    """
    Use searchText to resolve a city/zip to a center lat/lng (1 result).
    """
    headers = {**_auth_headers(), "X-Goog-FieldMask": GEOCODE_FIELD_MASK}
    body = {"textQuery": text_query, "pageSize": 1}
    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchText", headers=headers, json=body)
    if r.status_code != 200:
        return None
    places_ = r.json().get("places") or []
    if not places_:
        return None
    p = places_[0]
    loc = p.get("location") or {}
    lat = loc.get("latitude")
    lng = loc.get("longitude")
    if lat is None or lng is None:
        return None
    return float(lat), float(lng)

def nearby_search_apartments(center: dict, *, radius_m: int, page_size: int = 15, strict: bool = True) -> list[dict]:
    headers = {**_auth_headers(), "X-Goog-FieldMask": SEARCH_FIELD_MASK}
    lat = float(center["lat"]); lng = float(center["lng"])
    body = {
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": int(radius_m)}},
        "pageSize": max(1, min(int(page_size or 15), 20)),
    }
    if strict:
        body["includedTypes"] = ALLOWED_APARTMENT_TYPES
    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchNearby", headers=headers, json=body)
    if r.status_code != 200:
        raise PlacesError(f"searchNearby failed {r.status_code}: {r.text[:300]}")
    return r.json().get("places") or []

def search_nearby_v1(center: dict, *, radius_m: int, included_types: list[str] | None, max_results: int = 20) -> dict:
    headers = {**_auth_headers(), "X-Goog-FieldMask": SEARCH_FIELD_MASK}
    lat = float(center["lat"]); lng = float(center["lng"])
    body = {
        "locationRestriction": {"circle": {"center": {"latitude": lat, "longitude": lng}, "radius": int(radius_m)}},
        "pageSize": max(1, min(int(max_results or 20), 20)),
    }
    if included_types:
        body["includedTypes"] = included_types
    with _client() as c:
        r = c.post(f"{API_ROOT}/places:searchNearby", headers=headers, json=body)
    if r.status_code != 200:
        raise PlacesError(f"searchNearby_v1 failed {r.status_code}: {r.text[:300]}")
    return r.json()

def details_v1(place_id: str, fields: list[str]) -> dict:
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
    if not photos: return None
    return photos[0].get("name") or None

def _name_text(val):
    if isinstance(val, dict): return val.get("text")
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
