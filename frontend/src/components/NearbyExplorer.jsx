import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { GoogleMap, Marker, InfoWindow, useLoadScript, MarkerClusterer, OverlayView } from "@react-google-maps/api";
import { buildPhotoSrc } from "../lib/image";
import { Link } from "react-router-dom";
import { useSearchStore } from "../searchStore";

// outer wrapper: gray padded area around the map
const wrapperStyle = {
  backgroundColor: "#f3f4f6",
  padding: 12,
  borderRadius: 12,
  display: "block",
  maxWidth: 720,
  margin: "0 auto",
};

// inner map container: responsive square (height equals width)
const containerStyle = { width: "100%", aspectRatio: "1 / 1", borderRadius: 8, overflow: "hidden" };

// Category definitions (type -> label)
const CATEGORIES = [
  { key: "all", label: "All" },
  { key: "restaurant", label: "Restaurants" },
  { key: "cafe", label: "Cafes" },
  { key: "grocery_or_supermarket", label: "Groceries" },
  { key: "park", label: "Parks" },
  { key: "school", label: "Schools" },
];

// map category -> marker color (uses google's simple colored icons)
const CATEGORY_COLORS = {
  restaurant: "red",
  cafe: "orange",
  grocery_or_supermarket: "purple",
  park: "green",
  school: "blue",
  all: "blue",
};

function iconForCategory(category, isPrimary = false) {
  if (isPrimary) return { url: "http://maps.google.com/mapfiles/ms/icons/green-dot.png" };
  const color = CATEGORY_COLORS[category] || "red";
  return { url: `http://maps.google.com/mapfiles/ms/icons/${color}-dot.png` };
}

const STAR_SVG = encodeURIComponent(`
  <svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23FFD700' stroke='%23B8860B' stroke-width='0.5'>
    <path d='M12 2l2.9 6.26L21 9.27l-5 3.73L17.8 21 12 17.77 6.2 21 8 13l-5-3.73 6.1-1.01L12 2z'/>
  </svg>
`);

function starIcon() {
  return { url: `data:image/svg+xml;utf8,${STAR_SVG}`, scaledSize: { width: 28, height: 28 } };
}

export default function NearbyExplorer({ place, radius = 1500 }) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
    libraries: ["places"],
  });

  const mapRef = useRef(null);
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [nearby, setNearby] = useState([]); // { place, position, category }
  const [selectedNearby, setSelectedNearby] = useState(null);
  const [radiusMeters, setRadiusMeters] = useState(Number(radius) || 1500);
  const [isLoadingNearby, setIsLoadingNearby] = useState(false);
  const saveRadiusForPlace = useSearchStore((s) => s.saveRadiusForPlace);
  const getRadiusForPlace = useSearchStore((s) => s.getRadiusForPlace);
  const saveCategoryForPlace = useSearchStore((s) => s.saveCategoryForPlace);
  const getCategoryForPlace = useSearchStore((s) => s.getCategoryForPlace);

  const center = useMemo(() => ({ lat: Number(place?.lat), lng: Number(place?.lng) }), [place]);

  // compute haversine distance (meters) between two coords
  const distanceMeters = (a, b) => {
    const toRad = (deg) => (deg * Math.PI) / 180;
    const R = 6371000; // earth meters
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lng - a.lng);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);
    const sinDLat = Math.sin(dLat / 2);
    const sinDLon = Math.sin(dLon / 2);
    const aP = sinDLat * sinDLat + sinDLon * sinDLon * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(aP), Math.sqrt(1 - aP));
    return R * c;
  };

  const fetchNearby = useCallback(() => {
    if (!mapRef.current || !window.google || !center.lat) return;
    setIsLoadingNearby(true);
    const service = new window.google.maps.places.PlacesService(mapRef.current);

    // build request: if selectedCategory === 'all' we search a set of common types
    const categoriesToQuery = selectedCategory === "all" ? ["restaurant", "cafe", "grocery_or_supermarket", "park", "school"] : [selectedCategory];

    const results = [];
    let pending = categoriesToQuery.length;

    const onDone = () => {
      // dedupe by place_id and enforce radius filter
      const seen = new Set();
      const deduped = results
        .filter((r) => {
          if (!r.location) return false;
          const d = distanceMeters(center, r.location);
          return d <= radiusMeters;
        })
        .filter((r) => {
          if (seen.has(r.place_id)) return false;
          seen.add(r.place_id);
          return true;
        });
      setNearby(deduped);
      setIsLoadingNearby(false);
    };

    categoriesToQuery.forEach((cat) => {
      const req = {
        location: new window.google.maps.LatLng(center.lat, center.lng),
        radius: radiusMeters,
        type: cat,
      };
      service.nearbySearch(req, (places, status) => {
        pending -= 1;
        if (status === window.google.maps.places.PlacesServiceStatus.OK && places && places.length) {
          places.forEach((p) => {
            // Extract a client-safe photo URL if available via the Places JS API.
            // p.photos[0].getUrl(...) returns a usable URL for the client and
            // avoids needing to expose backend keys. If you prefer server
            // proxying, you could instead use a photo reference + backend.
            let image_url = null;
            try {
              if (p.photos && p.photos.length && typeof p.photos[0].getUrl === "function") {
                image_url = p.photos[0].getUrl({ maxWidth: 480, maxHeight: 320 });
              }
            } catch (e) {
              image_url = null;
            }

            // Build a maps URL that links to the place (fallback if p.url is not provided)
            const mapsUrl = p.url || (p.place_id ? `https://www.google.com/maps/search/?api=1&query_place_id=${p.place_id}` : null);
            results.push({
              place_id: p.place_id || p.id,
              name: p.name,
              address: p.vicinity || p.formatted_address,
              location: p.geometry && p.geometry.location ? { lat: p.geometry.location.lat(), lng: p.geometry.location.lng() } : null,
              rating: p.rating,
              user_ratings_total: p.user_ratings_total,
              category: cat,
              image_url,
              website: p.website || null,
              mapsUrl,
            });
          });
        }
        if (pending <= 0) onDone();
      });
    });
  }, [center, radiusMeters, selectedCategory]);

  // debounced radius change: persist radius for this place
  useEffect(() => {
    if (place?.place_id) saveRadiusForPlace(place.place_id, radiusMeters);
  }, [radiusMeters, place, saveRadiusForPlace]);

  // initialize radius from store if available
  useEffect(() => {
    if (place?.place_id) {
      const saved = getRadiusForPlace(place.place_id);
      if (saved) setRadiusMeters(saved);
      const savedCat = getCategoryForPlace(place.place_id);
      if (savedCat) setSelectedCategory(savedCat);
    }
  }, [place?.place_id, getRadiusForPlace]);


  // Debounce fetching so slider drags don't spam the API
  useEffect(() => {
    if (!isLoaded) return;
    const id = setTimeout(() => fetchNearby(), 250);
    return () => clearTimeout(id);
  }, [isLoaded, fetchNearby, selectedCategory, radiusMeters]);

  if (!place || !place.lat || !isLoaded) return (
    <div style={{ ...containerStyle, display: "grid", placeItems: "center", color: "#666" }}>
      Map unavailable
    </div>
  );

  return (
    <div style={wrapperStyle}>
      {/* controls overlay (zoom + center) */}
      <div style={{ position: "relative" }}>
        <div style={{ position: "absolute", top: 8, right: 8, zIndex: 1000, display: "flex", flexDirection: "column", gap: 8 }}>
          <button
            onClick={() => {
              if (!mapRef.current) return;
              const z = mapRef.current.getZoom?.() || 15;
              mapRef.current.setZoom?.(Math.min(z + 1, 21));
            }}
            style={{ width: 36, height: 36, borderRadius: 6, background: "#fff", border: "1px solid #ddd", cursor: "pointer" }}
            aria-label="Zoom in"
          >
            +
          </button>
          <button
            onClick={() => {
              if (!mapRef.current) return;
              const z = mapRef.current.getZoom?.() || 15;
              mapRef.current.setZoom?.(Math.max(z - 1, 0));
            }}
            style={{ width: 36, height: 36, borderRadius: 6, background: "#fff", border: "1px solid #ddd", cursor: "pointer" }}
            aria-label="Zoom out"
          >
            −
          </button>
          <button
            onClick={() => {
              if (!mapRef.current) return;
              mapRef.current.panTo({ lat: Number(place.lat), lng: Number(place.lng) });
              // ensure zoom is reasonable
              mapRef.current.setZoom?.(15);
            }}
            style={{ width: 36, height: 36, borderRadius: 6, background: "#fff", border: "1px solid #ddd", cursor: "pointer" }}
            title="Return to apartment"
            aria-label="Center apartment"
          >
            ⤒
          </button>
        </div>
      </div>
      <div style={{ display: "flex", gap: 12, marginBottom: 8, alignItems: "center" }}>
        {CATEGORIES.map((c) => (
          <label key={c.key} style={{ fontSize: 13 }}>
            <input
              type="radio"
              name="nearby-category"
              value={c.key}
              checked={selectedCategory === c.key}
              onChange={(e) => {
                setSelectedCategory(c.key);
                if (place?.place_id) saveCategoryForPlace(place.place_id, c.key);
              }}
              style={{ marginRight: 6 }}
            />
            {c.label}
          </label>
        ))}
        {isLoadingNearby && <div style={{ marginLeft: 8, fontSize: 13, color: '#666' }}>Loading…</div>}
      </div>

      {/* radius slider */}
      <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: "#333" }}>Radius: <strong>{Math.round(radiusMeters)} m</strong></div>
        <input
          type="range"
          min={200}
          max={5000}
          step={100}
          value={radiusMeters}
          onChange={(e) => setRadiusMeters(Number(e.target.value))}
          style={{ flex: 1 }}
        />
      </div>

      <GoogleMap
        onLoad={(map) => {
          mapRef.current = map;
          // center on listing location
          map.setCenter(center);
          map.setZoom(15);
        }}
        mapContainerStyle={containerStyle}
        center={center}
        zoom={15}
        options={{ streetViewControl: false, mapTypeControl: false }}
      >
        {/* primary listing marker */}
        <Marker
          key={place.place_id || place.id || "primary"}
          position={{ lat: Number(place.lat), lng: Number(place.lng) }}
          icon={iconForCategory(null, true)}
        />

        {/* star rendered as an OverlayView so it's positioned in pixels above the marker (keeps distance consistent across zoom) */}
        {isLoaded && place?.lat && (
          <OverlayView
            position={{ lat: Number(place.lat), lng: Number(place.lng) }}
            mapPaneName={OverlayView.OVERLAY_MOUSE_TARGET}
            // center horizontally and place above the marker by the overlay's height + 8px padding
            getPixelPositionOffset={(width, height) => ({ x: -width / 2, y: -height - 8 })}
          >
            <div style={{ pointerEvents: "none", display: "flex", justifyContent: "center", alignItems: "center" }}>
              <img
                src={`data:image/svg+xml;utf8,${STAR_SVG}`}
                alt="star"
                style={{ width: 28, height: 28, transform: "translateY(-2px)" }}
              />
            </div>
          </OverlayView>
        )}

        {/* use clusterer to manage nearby markers */}
        <MarkerClusterer>
          {(clusterer) => (
            nearby.map((n) => (
              n.location ? (
                <Marker
                  key={n.place_id}
                  position={{ lat: n.location.lat, lng: n.location.lng }}
                  icon={iconForCategory(n.category)}
                  clusterer={clusterer}
                  onClick={() => setSelectedNearby(n)}
                />
              ) : null
            ))
          )}
        </MarkerClusterer>

        {selectedNearby && selectedNearby.location && (
          <InfoWindow
            position={{ lat: selectedNearby.location.lat, lng: selectedNearby.location.lng }}
            onCloseClick={() => setSelectedNearby(null)}
          >
            <div style={{ maxWidth: 320 }}>
              {/* Top: two-column layout */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                {/* Left column: name, address, rating (stacked) */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, marginBottom: 6 }}>{selectedNearby.name}</div>
                  {selectedNearby.address && (
                    <div style={{ fontSize: 13, color: '#555', marginBottom: 8, lineHeight: 1.2 }}>{selectedNearby.address}</div>
                  )}
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center', color: '#333' }}>
                    {selectedNearby.rating != null && <div style={{ fontSize: 13 }}>⭐ {selectedNearby.rating}</div>}
                    {selectedNearby.user_ratings_total != null && (
                      <div style={{ fontSize: 12, color: '#666' }}>({selectedNearby.user_ratings_total})</div>
                    )}
                  </div>
                </div>

                {/* Right column: thumbnail */}
                <div style={{ width: 96, flexShrink: 0 }}>
                  {selectedNearby.image_url ? (
                    <img src={selectedNearby.image_url} alt={selectedNearby.name} style={{ width: '100%', height: 72, objectFit: 'cover', borderRadius: 6 }} />
                  ) : (
                    <div style={{ width: '100%', height: 72, borderRadius: 6, background: '#f3f4f6', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#999' }}>No image</div>
                  )}
                </div>
              </div>

              {/* Bottom: actions row */}
              <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
                <Link to={`/listing/${selectedNearby.place_id}`} state={{ place: selectedNearby }} style={{ padding: '6px 8px', background: '#2563eb', color: '#fff', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>View details</Link>
                {selectedNearby.website ? (
                  <a href={selectedNearby.website} target="_blank" rel="noreferrer" style={{ padding: '6px 8px', background: '#eef2ff', color: '#3730a3', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>Website</a>
                ) : null}
                {selectedNearby.mapsUrl ? (
                  <a href={selectedNearby.mapsUrl} target="_blank" rel="noreferrer" style={{ padding: '6px 8px', background: '#f6f7f9', color: '#333', borderRadius: 6, textDecoration: 'none', fontSize: 13 }}>Directions</a>
                ) : null}
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
    </div>
  );
}
