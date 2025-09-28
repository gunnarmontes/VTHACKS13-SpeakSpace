# mapapp/views.py
from typing import Optional, Tuple, Dict
from math import cos, radians
import os
import logging

import httpx
from django.conf import settings
from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView

from .services import places  # v1-based helpers
from .serializers import SearchQuerySerializer, PlaceSerializer

logger = logging.getLogger(__name__)

# --------------------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------------------
def _server_places_key() -> str:
    return os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_PLACES_KEY") or ""


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


# --------------------------------------------------------------------------------------
# Search endpoints
# --------------------------------------------------------------------------------------
class PropertySearch(APIView):
    """
    GET /api/properties/search/?mode=text&q=Norfolk,VA
    GET /api/properties/search/?mode=nearby&sw=lat,lng&ne=lat,lng
    """

    permission_classes = [AllowAny]
    authentication_classes = []  # ensure no JWT parsing on public GETs

    def get(self, request):
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
                # Be explicit for recall; try a couple of apartment-focused phrasings.
                attempts = []
                if q:
                    attempts = [
                        f"apartments near {q}",
                        f"apartments in {q}",
                        f"{q} apartments",
                    ]
                else:
                    attempts = ["apartments"]

                for txt in attempts:
                    logger.info("Text search attempt: %s", txt)
                    raw = places.text_search_apartments(text_query=txt, page_size=15)
                    if raw:
                        break  # stop on first hit

            elif mode == "nearby":
                br = bounds_to_center_radius(sw, ne)
                if not br:
                    return Response({"results": [], "error": "Invalid bounds."}, status=400)
                lat, lng, radius_m = br
                logger.info("Nearby center=(%.5f,%.5f) r=%dm", lat, lng, radius_m)
                raw = places.nearby_search_apartments({"lat": lat, "lng": lng}, radius_m=radius_m, page_size=15)

            else:
                # Legacy fallback
                if sw and ne and not q:
                    br = bounds_to_center_radius(sw, ne)
                    if not br:
                        return Response({"results": [], "error": "Invalid bounds."}, status=400)
                    lat, lng, radius_m = br
                    raw = places.nearby_search_apartments({"lat": lat, "lng": lng}, radius_m=radius_m, page_size=15)
                else:
                    attempts = [f"apartments near {q}", f"apartments in {q}", q or "apartments"]
                    for txt in attempts:
                        if not txt:
                            continue
                        raw = places.text_search_apartments(text_query=txt, page_size=15)
                        if raw:
                            break

            # Normalize
            normalized = [places.normalize_place(p) for p in (raw or [])]

            # Loosen the filter: keep common apartment-ish types, else fall back to unfiltered results
            ALLOWED_TYPES = {
                "apartment_complex",
                "apartment_rental_agency",
                "apartment",
                "apartment_building",
                "condominium_complex",
                "property_management_company",
                "real_estate_agency",
            }

            filtered = [
                r for r in normalized
                if (r.get("primaryType") in ALLOWED_TYPES)
                or any(t in ALLOWED_TYPES for t in (r.get("types") or []))
                or ("apartment" in (r.get("name") or "").lower())
            ]

            out = filtered if filtered else normalized

            serializer = PlaceSerializer(out, many=True)
            logger.info("Returning %d results", len(serializer.data))
            return Response({"results": serializer.data})

        except places.PlacesError as e:
            logger.exception("Places error: %s", e)
            return Response({"results": [], "error": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


# --------------------------------------------------------------------------------------
# Photo proxy (v1 + legacy)
# --------------------------------------------------------------------------------------
class PlacePhoto(APIView):
    """
    GET /api/places/photo?name=places/XYZ/photos/ABC&maxwidth=600&maxheight=400
    GET /api/places/photo?ref=<photoreference>&maxwidth=600
    """
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        key = _server_places_key()
        name = (request.GET.get("name") or "").strip()
        ref = (request.GET.get("ref") or "").strip()
        maxwidth = (request.GET.get("maxwidth") or "600").strip()
        maxheight = (request.GET.get("maxheight") or "400").strip()

        if name:
            if not key:
                return (JsonResponse({"detail": "Missing Google key"}, status=500)
                        if settings.DEBUG else HttpResponse(status=502))

            media_url = f"https://places.googleapis.com/v1/{name}/media"
            params = {"maxWidthPx": maxwidth, "maxHeightPx": maxheight, "key": key}
            try:
                with httpx.Client(timeout=15.0, follow_redirects=True) as c:
                    r = c.get(media_url, params=params)
            except Exception as e:
                logger.exception("Photo v1 error: %s", e)
                return HttpResponse(status=502)

            ctype = r.headers.get("content-type", "")
            if r.status_code != 200 or "image" not in ctype:
                if settings.DEBUG:
                    return JsonResponse({"status": r.status_code, "upstream": r.text}, status=502, safe=False)
                return HttpResponse(status=502)

            resp = HttpResponse(r.content, content_type=ctype)
            resp["Cache-Control"] = "public, max-age=86400"
            return resp

        if ref:
            if not key:
                return (JsonResponse({"detail": "Missing Google key"}, status=500)
                        if settings.DEBUG else HttpResponse(status=502))
            url = "https://maps.googleapis.com/maps/api/place/photo"
            params = {"photo_reference": ref, "maxwidth": maxwidth, "key": key}
            with httpx.Client(timeout=15.0, follow_redirects=True) as c:
                r = c.get(url, params=params)
            ctype = r.headers.get("content-type", "")
            if r.status_code != 200 or "image" not in ctype:
                return HttpResponse(status=502)
            resp = HttpResponse(r.content, content_type=ctype)
            resp["Cache-Control"] = "public, max-age=86400"
            return resp

        return HttpResponseBadRequest("Provide photo 'name' (v1) or 'ref' (legacy).")


# --------------------------------------------------------------------------------------
# Property details
# --------------------------------------------------------------------------------------
class PropertyDetail(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request, place_id: str):
        try:
            fields = [
                "id","displayName","formattedAddress","location",
                "googleMapsUri","websiteUri","rating","userRatingCount","photos",
            ]
            data = places.details_v1(place_id, fields)
            out = places.normalize_details_basic(data)
            return Response(out)
        except Exception as e:
            logger.exception("PropertyDetail error: %s", e)
            return Response({"detail": str(e)}, status=status.HTTP_502_BAD_GATEWAY)


# --------------------------------------------------------------------------------------
# Nearby POIs
# --------------------------------------------------------------------------------------
NEARBY_TYPE_MAP: Dict[str, list] = {
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
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        try:
            lat = float(request.GET.get("lat"))
            lng = float(request.GET.get("lng"))
        except (TypeError, ValueError):
            return Response({"error": "lat/lng required"}, status=400)

        radius = int(request.GET.get("radius", "1500"))
        radius = max(200, min(radius, 5000))

        raw_types = (request.GET.get("types") or "").lower().split(",")
        raw_types = [t.strip() for t in raw_types if t.strip()]

        included_types: list[str] = []
        for key in raw_types:
            included_types += NEARBY_TYPE_MAP.get(key, [])
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
