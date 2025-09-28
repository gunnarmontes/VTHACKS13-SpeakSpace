// src/components/MapView.jsx
import React, { useEffect, useMemo, useRef, useCallback } from "react";
import { GoogleMap, Marker, InfoWindow, useLoadScript } from "@react-google-maps/api";
import { Link } from "react-router-dom"; // ✅ add
import { buildPhotoSrc } from "../lib/image";

const containerStyle = { width: "100%", height: "100%" };

const defaultPinIcon = {
  url: "https://maps.gstatic.com/mapfiles/ms2/micons/green.png",
  scaledSize: { width: 32, height: 32 },
};

// small debounce (unchanged if you already have one)
const debounce = (fn, ms = 200) => {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
};

export default function MapView({
  properties,
  selected,
  onSelect,
  defaultCenter,
  defaultZoom = 13,
  onMapLoad,
  onBoundsChange,
  emitOnLoad = false,
  fitToResults = true,
  pinIcon = defaultPinIcon,
}) {
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_KEY,
  });

  const mapRef = useRef(null);
  const skipNextIdleEmitRef = useRef(false);

  const center = useMemo(
    () => defaultCenter || { lat: 37.2296, lng: -80.4139 },
    [defaultCenter]
  );

  useEffect(() => {
    if (!fitToResults) return;
    if (!mapRef.current || !window.google) return;
    if (!Array.isArray(properties) || properties.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    let added = 0;
    for (const p of properties) {
      const lat = Number(p?.lat);
      const lng = Number(p?.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        bounds.extend({ lat, lng });
        added++;
      }
    }
    if (added > 0) {
      skipNextIdleEmitRef.current = true;
      try { mapRef.current.fitBounds(bounds); } catch {}
    }
  }, [properties, fitToResults]);

  const emitBounds = useCallback(
    debounce(() => {
      if (!mapRef.current) return;
      if (skipNextIdleEmitRef.current) {
        skipNextIdleEmitRef.current = false;
        return;
      }
      const b = mapRef.current.getBounds?.();
      if (!b) return;
      const ne = b.getNorthEast?.();
      const sw = b.getSouthWest?.();
      if (!ne || !sw) return;
      onBoundsChange?.({
        neLat: ne.lat(), neLng: ne.lng(),
        swLat: sw.lat(), swLng: sw.lng(),
      });
    }, 200),
    [onBoundsChange]
  );

  if (!isLoaded) return <div style={{ padding: 8 }}>Loading map…</div>;

  return (
    <GoogleMap
      onLoad={(map) => {
        mapRef.current = map;
        onMapLoad?.(map);
        if (emitOnLoad) setTimeout(() => emitBounds(), 0);
      }}
      onIdle={emitBounds}
      mapContainerStyle={containerStyle}
      center={center}
      zoom={defaultZoom}
      options={{
        streetViewControl: false,
        mapTypeControl: false,
        gestureHandling: "greedy",
      }}
      onClick={() => onSelect?.(null)}
    >
      {Array.isArray(properties) &&
        properties.map((p) => {
          const lat = Number(p?.lat);
          const lng = Number(p?.lng);
          if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
          return (
            <Marker
              key={p.id}
              position={{ lat, lng }}
              onClick={(e) => {
                e.domEvent?.stopPropagation?.(); // don’t let map click close it
                onSelect?.(p);
              }}
              icon={pinIcon}
            />
          );
        })}

      {selected &&
        Number.isFinite(Number(selected.lat)) &&
        Number.isFinite(Number(selected.lng)) && (
          <InfoWindow
            position={{ lat: Number(selected.lat), lng: Number(selected.lng) }}
            onCloseClick={() => onSelect?.(null)}
            options={{ maxWidth: 280 }}
          >
            {/* CARD CONTENT */}
            <div style={card.container} onClick={(e) => e.stopPropagation()}>
              {(() => {
                const src = buildPhotoSrc(selected);
                return src ? (
                  <img
                    src={src}
                    alt={selected.name || "Apartment photo"}
                    style={card.image}
                    loading="lazy"
                  />
                ) : null;
              })()}

              <div style={card.body}>
                <div style={card.title}>{selected.name || "Apartment"}</div>
                {selected.address && (
                  <div style={card.sub}>{selected.address}</div>
                )}
                {(selected.rating != null || selected.user_ratings_total != null) && (
                  <div style={card.meta}>
                    {selected.rating != null && <>⭐ {selected.rating}</>}{" "}
                    {selected.user_ratings_total != null && (
                      <span style={{ color: "#666" }}>
                        ({selected.user_ratings_total})
                      </span>
                    )}
                  </div>
                )}

                <div style={card.actions}>
                  {/* Primary CTA: internal detail page */}
                  <Link
                    to={`/listing/${selected.id}`}
                    state={{ place: selected }}
                    style={card.primaryBtn}
                  >
                    View details
                  </Link>

                  {/* Secondary CTA: open in Google Maps */}
                  {selected.url && (
                    <a
                      href={selected.url}
                      target="_blank"
                      rel="noreferrer"
                      style={card.secondaryBtn}
                    >
                      Maps
                    </a>
                  )}
                </div>
              </div>
            </div>
          </InfoWindow>
        )}
    </GoogleMap>
  );
}

/* ---- inline card styles ---- */
const card = {
  container: {
    width: 260,
    maxWidth: 260,
    borderRadius: 10,
    overflow: "hidden",
    boxShadow: "0 6px 20px rgba(0,0,0,0.12)",
    border: "1px solid #e8e8e8",
    background: "#fff",
  },
  image: {
    width: "100%",
    height: 120,
    objectFit: "cover",
    display: "block",
  },
  body: { padding: 10 },
  title: { fontWeight: 700, fontSize: 15, marginBottom: 4, color: "#111" },
  sub: { fontSize: 12, color: "#666", marginBottom: 6, lineHeight: 1.3 },
  meta: { fontSize: 12, color: "#333", marginBottom: 10 },
  actions: {
    display: "flex",
    gap: 8,
    alignItems: "center",
    marginTop: 6,
  },
  primaryBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    fontSize: 12,
    textDecoration: "none",
    display: "inline-block",
  },
  secondaryBtn: {
    padding: "6px 10px",
    borderRadius: 8,
    background: "#eef2ff",
    color: "#3730a3",
    fontWeight: 600,
    fontSize: 12,
    textDecoration: "none",
    display: "inline-block",
  },
};
