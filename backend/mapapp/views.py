# mapapp/views.py
from typing import Optional, Tuple, Dict
from math import cos, radians

import httpx
from django.conf import settings
from django.http import HttpResponse, HttpResponseBadRequest
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .services import places  # v1-based
from .serializers import SearchQuerySerializer, PlaceSerializer  # ▶️ NEW

import logging
logger = logging.getLogger(__name__)


def bounds_to_center_radius(sw: str, ne: str) -> Optional[Tuple[float, float, int]]:
    try:
        sw_lat, sw_lng = map(float, sw.split(","))
        ne_lat, ne_lng = map(float, ne.split(","))
    except Exception:
        return None
    center_lat = (sw_lat + ne_lat) / 2.0
    center_lng = (sw_lng + ne_lng) / 2.0
    lat_m = (ne_lat - sw_lat) * 111_000
    lng_m = (ne_lng - sw_lng) * 111_000 * cos(radians(center_lat))
    diag = (lat_m ** 2 + lng_m ** 2) ** 0.5
    radius_m = int(diag / 2)
    radius_m = max(500, min(radius_m, 30_000))
    return (center_lat, center_lng, radius_m)


class PropertySearch(APIView):
    """
    GET /api/properties/search/?mode=text&q=Norfolk,VA
    GET /api/properties/search/?mode=nearby&sw=lat,lng&ne=lat,lng
    """
    def get(self, request):
        # ▶️ NEW: validate query params with a serializer
        qp = SearchQuerySerializer(data=request.GET)
        if not qp.is_valid():
            return Response({"results": [], "error": qp.errors}, status=400)
        params = qp.validated_data

        mode = (params.get("mode") or "").strip().lower()
        q    = (params.get("q") or "").strip()
        sw   = params.get("sw")
        ne   = params.get("ne")

        try:
            raw = []

            if mode == "text":
                search_text = q if q else "apartments"
                logger.info("Mode=text, q=%s", search_text)
                raw = places.text_search_apartments(text_query=search_text, page_size=15)
                if not raw and q:
                    raw = places.text_search_apartments(text_query=f"apartments near {q}", page_size=15)

            elif mode == "nearby":
                br = bounds_to_center_radius(sw, ne)
                if not br:
                    return Response({"results": [], "error": "Invalid bounds."}, status=400)
                lat, lng, radius_m = br
                logger.info("Mode=nearby center=(%.5f,%.5f) r=%dm", lat, lng, radius_m)
                raw = places.nearby_search_apartments({"lat": lat, "lng": lng}, radius_m=radius_m, page_size=15)

            else:
                # Legacy fallback: prefer nearby if only bounds, else text
                if sw and ne and not q:
                    br = bounds_to_center_radius(sw, ne)
                    if not br:
                        return Response({"results": [], "error": "Invalid bounds."}, status=400)
                    lat, lng, radius_m = br
                    raw = places.nearby_search_apartments({"lat": lat, "lng": lng}, radius_m=radius_m, page_size=15)
                else:
                    search_text = q if q else "apartments"
                    raw = places.text_search_apartments(text_query=search_text, page_size=15)
                    if not raw and q:
                        raw = places.text_search_apartments(text_query=f"apartments near {q}", page_size=15)

            # Normalize -> validate/serialize out
            normalized = [places.normalize_place(p) for p in raw]

            # Optional guard: keep apartments/related only
            ALLOWED_TYPES = {"apartment_complex", "property_management_company", "real_estate_agency"}
            filtered = [
                r for r in normalized
                if (r.get("primaryType") in ALLOWED_TYPES) or any(t in ALLOWED_TYPES for t in (r.get("types") or []))
            ]

            # ▶️ NEW: serialize the list for consistent output & type safety
            serializer = PlaceSerializer(filtered, many=True)
            logger.info("Returning %d results", len(serializer.data))
            return Response({"results": serializer.data})

        except places.PlacesError as e:
            logger.exception("Places error: %s", e)
            return Response({"results": [], "error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


class PlacePhoto(APIView):
    """
    GET /api/places/photo?name=places/XYZ/photos/ABC&maxwidth=600&maxheight=400
    Streams a Google Places (v1) photo without exposing your API key.
    Also supports legacy ref= (v0) if you still need it.
    """
    def get(self, request):
        name = request.GET.get("name")  # v1 photo resource name
        maxwidth = request.GET.get("maxwidth", "600")
        maxheight = request.GET.get("maxheight", "400")

        if name:
            media_url = f"https://places.googleapis.com/v1/{name}/media"
            params = {
                "maxWidthPx": maxwidth,
                "maxHeightPx": maxheight,
                "key": settings.GOOGLE_PLACES_KEY,
            }
            with httpx.Client(timeout=10.0, follow_redirects=True) as c:
                r = c.get(media_url, params=params)
                if r.status_code != 200 or "image" not in r.headers.get("content-type", ""):
                    return HttpResponse(status=502)
                resp = HttpResponse(r.content, content_type=r.headers["content-type"])
                resp["Cache-Control"] = "public, max-age=86400"
                return resp

        ref = request.GET.get("ref")
        if ref:
            url = "https://maps.googleapis.com/maps/api/place/photo"
            params = {"photo_reference": ref, "maxwidth": maxwidth, "key": settings.GOOGLE_PLACES_KEY}
            with httpx.Client(timeout=10.0, follow_redirects=True) as c:
                r = c.get(url, params=params)
                if r.status_code != 200 or "image" not in r.headers.get("content-type", ""):
                    return HttpResponse(status=502)
                resp = HttpResponse(r.content, content_type=r.headers["content-type"])
                resp["Cache-Control"] = "public, max-age=86400"
                return resp

        return HttpResponseBadRequest("Provide photo 'name' (v1) or 'ref' (legacy).")


# mapapp/views.py (PropertyDetail)
class PropertyDetail(APIView):
    def get(self, request, place_id: str):
        try:
            # Base fields only — no reviewSummary
            fields = [
                "id","displayName","formattedAddress","location",
                "googleMapsUri","websiteUri","rating","userRatingCount",
                "photos",
            ]
            data = places.details_v1(place_id, fields)
            out = places.normalize_details_basic(data)  # see below
            return Response(out)
        except Exception as e:
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)
        

NEARBY_TYPE_MAP = {
    "restaurants": ["restaurant", "cafe"],
    "bars":        ["bar"],
    "coffee":      ["cafe"],
    "activities":  ["park", "movie_theater", "museum", "tourist_attraction"],
    "shopping":    ["shopping_mall"],
    "gyms":        ["gym"],
}

class NearbyAround(APIView):
    """
    GET /api/places/nearby/?lat=...&lng=...&types=restaurants,bars&radius=1500
    """
    def get(self, request):
        try:
            lat = float(request.GET.get("lat"))
            lng = float(request.GET.get("lng"))
        except (TypeError, ValueError):
            return Response({"error": "lat/lng required"}, status=400)

        radius = int(request.GET.get("radius", "1500"))
        radius = max(200, min(radius, 5000))  # sane bounds

        raw_types = (request.GET.get("types") or "").lower().split(",")
        raw_types = [t.strip() for t in raw_types if t.strip()]

        included_types: list[str] = []
        for key in raw_types:
            included_types += NEARBY_TYPE_MAP.get(key, [])
        # if user passed a real Places type directly, keep it
        if not included_types and raw_types:
            included_types = raw_types

        data = places.search_nearby_v1(
            {"lat": lat, "lng": lng},
            radius_m=radius,
            included_types=included_types or None,
            max_results=20,
        )
        items = data.get("places") or []
        results = [places.normalize_v1_place_basic(p) for p in items]
        return Response({"results": results})
