// src/pages/Dashboard.jsx
import React, { useEffect, useState, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import api from "../api";
import MapView from "../components/MapView";
import { useSearchStore } from "../searchStore";

export default function Dashboard() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [mapRefState, setMapRefState] = useState(null);

  const {
    getResults,
    getResultsOrLast,
    saveResults,
    getLast,
    saveMapState,
    lastRestored,
    markRestored,
    sidebarScrollTop,
    setSidebarScroll,
  } = useSearchStore();

  const sidebarRef = useRef(null);

  // Restore last results + map + scroll on first mount
  const hasRestored = useRef(false);
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;
    const last = getLast();
    if (last?.results?.length) {
      setProperties(last.results);
      if (last.params?.mode === "text") setQ(last.params.q || "");
      if (last.mapState) setMapRefState(last.mapState);
      markRestored(true);
      // restore scroll after paint
      requestAnimationFrame(() => {
        if (sidebarRef.current) sidebarRef.current.scrollTop = sidebarScrollTop || 0;
      });
    }
  }, [getLast, markRestored, sidebarScrollTop]);

  // Cache-aware search runner
  const runSearch = useCallback(
    async (params) => {
      setLoading(true);
      setSelected(null);

      const cached = getResults(params);
      if (cached?.results?.length) {
        setProperties(cached.results);
        markRestored(true);
        setLoading(false);
        return;
      }

      try {
        const { data } = await api.get("/api/properties/search/", { params });
        const results = data?.results || [];
        setProperties(results);
        saveResults(params, results, mapRefState || null);
        markRestored(false);
      } catch (err) {
        console.error("Search failed:", err);
        setProperties([]);
      } finally {
        setLoading(false);
      }
    },
    [getResults, saveResults, mapRefState, markRestored]
  );

  const handleTextSearch = (e) => {
    e?.preventDefault();
    const query = q.trim();
    if (!query || loading) return;
    runSearch({ mode: "text", q: query });
  };

  const handleAreaSearch = () => {
    if (!mapBounds || loading) return;
    runSearch({
      mode: "nearby",
      ne: `${mapBounds.neLat},${mapBounds.neLng}`,
      sw: `${mapBounds.swLat},${mapBounds.swLng}`,
    });
  };

  // Persist map center/zoom
  const handleMapLoad = (map) => {
    const save = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const mapState = { center: { lat: center.lat(), lng: center.lng() }, zoom };
      const paramsGuess = q
        ? { mode: "text", q }
        : mapBounds
        ? {
            mode: "nearby",
            sw: `${mapBounds.swLat},${mapBounds.swLng}`,
            ne: `${mapBounds.neLat},${mapBounds.neLng}`,
          }
        : { mode: "text", q: "" };
      saveMapState(paramsGuess, mapState);
      setMapRefState(mapState);
    };
    map.addListener("idle", save);
  };

  // Save sidebar scroll position on unmount
  useEffect(() => {
    return () => {
      if (sidebarRef.current) setSidebarScroll(sidebarRef.current.scrollTop || 0);
    };
  }, [setSidebarScroll]);

  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      {/* Sidebar */}
      <aside
        ref={sidebarRef}
        style={{
          flex: "0 0 320px",
          maxWidth: 420,
          borderRight: "1px solid #eee",
          padding: 12,
          overflowY: "auto",
          background: "#fff",
          position: "relative",
          zIndex: 2,
        }}
      >
        <form onSubmit={handleTextSearch} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            type="text"
            placeholder="Search city or zip (e.g., Norfolk, VA)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ flex: 1, padding: 8 }}
          />
          <button type="submit" disabled={loading}>
            {loading ? "Searching…" : "Search"}
          </button>
        </form>

        <button
          onClick={handleAreaSearch}
          disabled={loading || !mapBounds}
          style={{ marginBottom: 12 }}
          title={mapBounds ? "Search within the current map view" : "Move the map first"}
        >
          {loading ? "Searching…" : "Search this area"}
        </button>

        {/* Restored banner */}
        {lastRestored && (
          <div
            style={{
              background: "#e8f0ff",
              border: "1px solid #cfe0ff",
              color: "#173a7a",
              padding: "8px 10px",
              borderRadius: 6,
              marginBottom: 10,
              fontSize: 13,
            }}
          >
            Restored previous results. Perform a new search to refresh.
          </div>
        )}

        <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
          Results: {properties.length}
        </div>

        {Array.isArray(properties) && properties.length > 0 ? (
          properties.map((p) => (
            <Link
              key={p.id}
              to={`/listing/${p.id}`}
              state={{ place: p }}
              style={{ textDecoration: "none", color: "inherit" }}
              onClick={() => setSelected(p)}
            >
              <div
                style={{
                  border: "1px solid #ddd",
                  borderRadius: 8,
                  padding: 10,
                  marginBottom: 10,
                  cursor: "pointer",
                  background: selected?.id === p.id ? "#f3f8ff" : "white",
                }}
              >
                <div style={{ fontWeight: 600 }}>{p.name || "Unnamed"}</div>
                {p.address && (
                  <div style={{ fontSize: 12, color: "#666", marginTop: 2 }}>{p.address}</div>
                )}
                {p.image_url && (
                  <img
                    src={p.image_url}
                    alt={p.name || "Apartment photo"}
                    style={{ width: "100%", height: 140, objectFit: "cover", borderRadius: 6, marginTop: 8 }}
                    loading="lazy"
                  />
                )}
              </div>
            </Link>
          ))
        ) : (
          <div style={{ color: "#888" }}>No results.</div>
        )}
      </aside>

      {/* Map */}
      <main style={{ flex: 1, minWidth: 0 }}>
        <MapView
          properties={properties}
          selected={selected}
          onSelect={setSelected}
          defaultCenter={mapRefState?.center || { lat: 37.2296, lng: -80.4139 }}
          defaultZoom={mapRefState?.zoom || 13}
          fitToResults={!mapRefState} // don’t auto-fit if restoring a saved view
          onMapLoad={handleMapLoad}
          onBoundsChange={setMapBounds}
        />
      </main>
    </div>
  );
}
