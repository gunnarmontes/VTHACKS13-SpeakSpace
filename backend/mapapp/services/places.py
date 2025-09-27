# mapapp/services/places.py
from typing import Dict, Any, List, Optional
from django.conf import settings
import requests
import httpx

PLACES_KEY = getattr(settings, "GOOGLE_PLACES_KEY", "")
BASE = "https://places.googleapis.com/v1"

# v1 requires a field mask; keep it tight for performance/cost
FIELD_MASK = ",".join([
    "places.id",
    "places.displayName",
    "places.formattedAddress",
    "places.location",
    "places.primaryType",
    "places.types",
    "places.rating",
    "places.userRatingCount",
    "places.photos",
    "places.googleMapsUri",
])

HEADERS = {
    "X-Goog-Api-Key": PLACES_KEY,
    "Content-Type": "application/json",
    "X-Goog-FieldMask": FIELD_MASK,
}


class PlacesError(Exception):
    pass


def _post(path: str, body: Dict[str, Any]) -> Dict[str, Any]:
    if not PLACES_KEY:
        raise PlacesError("Missing GOOGLE_PLACES_KEY.")
    url = f"{BASE}/{path}"
    r = requests.post(url, json=body, headers=HEADERS, timeout=10)
    if r.status_code >= 400:
        raise PlacesError(f"{r.status_code}: {r.text}")
    return r.json() if r.text else {}


def _photo_media_url(photo_name: str, max_w: int = 640, max_h: int = 400) -> str:
    """
    We still proxy photos to avoid exposing the API key in the browser.
    This returns our proxy endpoint with the v1 photo 'name'.
    """
    return f"/api/places/photo?name={photo_name}&maxwidth={max_w}&maxheight={max_h}"


def text_search_apartments(
    text_query: str,
    bias_center: Optional[Dict[str, float]] = None,
    bias_radius_m: int = 4000,
    page_size: int = 10,
) -> List[Dict[str, Any]]:
    """
    v1 Text Search with strict type filtering on apartment complexes.
    """
    body: Dict[str, Any] = {
        "textQuery": text_query or "apartments",
        "includedType": "apartment_complex",
        "strictTypeFiltering": True,
        "pageSize": int(page_size),
    }
    if bias_center:
        body["locationBias"] = {
            "circle": {
                "center": {"latitude": bias_center["lat"], "longitude": bias_center["lng"]},
                "radius": float(bias_radius_m),
            }
        }
    data = _post("places:searchText", body)
    return data.get("places", []) or []


def nearby_search_apartments(
    center: Dict[str, float],
    radius_m: int = 4000,
    page_size: int = 10,
) -> List[Dict[str, Any]]:
    """
    v1 Nearby Search constrained by a circle (center+radius),
    filtered to apartment complexes only.
    """
    body = {
        "includedTypes": ["apartment_complex"],
        "locationRestriction": {
            "circle": {
                "center": {"latitude": center["lat"], "longitude": center["lng"]},
                "radius": float(radius_m),
            }
        },
        "maxResultCount": int(page_size),
        "rankPreference": "DISTANCE",
    }
    data = _post("places:searchNearby", body)
    return data.get("places", []) or []


def normalize_place(p: Dict[str, Any]) -> Dict[str, Any]:
    loc = p.get("location") or {}
    display_name = (p.get("displayName") or {}).get("text")
    photos = p.get("photos") or []
    photo_name = photos[0].get("name") if photos else None

    return {
        "id": p.get("id"),
        "place_id": p.get("id"),  # keep a stable key for your UI
        "name": display_name,
        "lat": loc.get("latitude"),
        "lng": loc.get("longitude"),
        "address": p.get("formattedAddress"),
        "primaryType": p.get("primaryType"),
        "types": p.get("types") or [],
        "rating": p.get("rating"),
        "user_ratings_total": p.get("userRatingCount"),
        "url": p.get("googleMapsUri"),
        # Generate a backend-proxied photo URL (no key in browser)
        "image_url": _photo_media_url(photo_name) if photo_name else None,
    }


def details_v1(place_id: str, fields: list[str]):
    if not PLACES_KEY:
      raise RuntimeError("Missing GOOGLE_PLACES_KEY")
    url = f"https://places.googleapis.com/v1/places/{place_id}"
    headers = {
      "X-Goog-Api-Key": PLACES_KEY,
      "X-Goog-FieldMask": ",".join(fields),  # v1 requires a field mask
    }
    with httpx.Client(timeout=10.0) as c:
      r = c.get(url, headers=headers)
      r.raise_for_status()
      return r.json()

# mapapp/services/places.py (add this alongside your other helpers)
def normalize_details_basic(p: dict) -> dict:
    def lt(x): return (x or {}).get("text")

    photos = p.get("photos") or []
    photo_name = photos[0].get("name") if photos else None
    image_url = f"/api/places/photo?name={photo_name}&maxwidth=640&maxheight=400" if photo_name else None

    return {
        "id":            p.get("id"),
        "place_id":      p.get("id"),
        "name":          lt(p.get("displayName")),
        "address":       p.get("formattedAddress"),
        "lat":           (p.get("location") or {}).get("latitude"),
        "lng":           (p.get("location") or {}).get("longitude"),
        "rating":        p.get("rating"),
        "user_ratings_total": p.get("userRatingCount"),
        "url":           p.get("googleMapsUri"),
        "website":       p.get("websiteUri"),
        "image_url":     image_url,
        # ⛔️ no review_summary / review_disclosure / review_link
    }


def search_nearby_v1(
    center: dict,                 # {"lat": float, "lng": float}
    radius_m: int = 1500,
    included_types: list[str] = None,
    max_results: int = 20,
):
    """
    POST https://places.googleapis.com/v1/places:searchNearby
    Only returns requested fields via X-Goog-FieldMask.
    """
    if not PLACES_KEY:
        raise RuntimeError("Missing GOOGLE_PLACES_KEY")

    url = "https://places.googleapis.com/v1/places:searchNearby"
    headers = {
        "X-Goog-Api-Key": PLACES_KEY,
        "X-Goog-FieldMask": ",".join([
            # project the fields we need to render
            "places.id",
            "places.displayName",
            "places.formattedAddress",
            "places.location",
            "places.types",
            "places.rating",
            "places.userRatingCount",
            "places.photos",
        ]),
    }
    body = {
        "locationRestriction": {
            "circle": {
                "center": {"latitude": center["lat"], "longitude": center["lng"]},
                "radius": radius_m,
            }
        },
        "maxResultCount": max_results,
    }
    if included_types:
        body["includedTypes"] = included_types

    with httpx.Client(timeout=10.0) as c:
        r = c.post(url, headers=headers, json=body)
        r.raise_for_status()
        return r.json()

def normalize_v1_place_basic(p: dict) -> dict:
    """Flatten one v1 'place' object to FE-friendly shape."""
    def lt(x): return (x or {}).get("text")
    photos = p.get("photos") or []
    photo_name = photos[0].get("name") if photos else None
    image_url = f"/api/places/photo?name={photo_name}&maxwidth=480&maxheight=320" if photo_name else None
    loc = p.get("location") or {}
    return {
        "id":        p.get("id"),
        "place_id":  p.get("id"),
        "name":      lt(p.get("displayName")),
        "address":   p.get("formattedAddress"),
        "lat":       loc.get("latitude"),
        "lng":       loc.get("longitude"),
        "types":     p.get("types") or [],
        "rating":    p.get("rating"),
        "user_ratings_total": p.get("userRatingCount"),
        "image_url": image_url,
    }
