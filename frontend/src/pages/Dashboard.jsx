// src/pages/Dashboard.jsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Link, useLocation } from "react-router-dom";
import api from "../api";
import MapView from "../components/MapView";
import { useSearchStore } from "../searchStore";

/**
 * Dashboard
 * - Restores last results/map/scroll
 * - Runs searches (text or nearby) with cache-awareness
 * - Reacts to voice-agent navigation (/dashboard?mode=...&q=... or &sw/ne)
 * - Optional postMessage bridge if you keep it
 * - Persists map state on idle
 */
export default function Dashboard() {
  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [properties, setProperties] = useState([]);
  const [selected, setSelected] = useState(null);
  const [mapBounds, setMapBounds] = useState(null);
  const [mapRefState, setMapRefState] = useState(null);
  const [agentBanner, setAgentBanner] = useState(null);

  // Router
  const location = useLocation();

  // Store (zustand)
  const {
    getResults,
    saveResults,
    getLast,
    saveMapState,
    lastRestored,
    markRestored,
    sidebarScrollTop,
    setSidebarScroll,
  } = useSearchStore();

  // Refs
  const sidebarRef = useRef(null);
  const hasRestored = useRef(false);

  // Axios cancellation per runSearch to avoid race-y state updates
  const currentAbortRef = useRef(null);

  // API base (absolute origin to deployed backend, no trailing slash)
  const API_BASE = useMemo(() => {
    // Prefer the Vite-provided env var. If it's not set (dev server not
    // restarted after editing `.env`), fall back to the deployed host so the
    // UI can still load images. This is a helpful fallback during debugging.
    const fallback = "https://vthacks13-speakspace.onrender.com";
    const raw = import.meta.env.VITE_API_URL || fallback;
    const base = raw.replace(/\/+$/, "");
    // Helpful runtime debug so you can verify what the client is using.
    // Remove or reduce this in production.
    // eslint-disable-next-line no-console
    console.debug("API_BASE resolved to:", base);
    return base;
  }, []);

  // Build a safe, absolute photo src for the UI. Prefer `photoName` (v1
  // photo resource) and fall back to `image_url`. If `image_url` is
  // a relative proxy path (starts with `/api`), prefix it with API_BASE so
  // requests go to the configured backend (deployed host) instead of the
  // frontend origin.
  const buildPhotoSrc = useCallback(
    (p) => {
      if (!p) return null;
      if (p.photoName) {
        return `${API_BASE}/api/places/photo?${new URLSearchParams({
          name: p.photoName,
          maxwidth: "640",
          maxheight: "400",
        }).toString()}`;
      }
      if (p.image_url) {
        return p.image_url.startsWith("/api") ? `${API_BASE}${p.image_url}` : p.image_url;
      }
      return null;
    },
    [API_BASE]
  );

  // ---------------------------------------------------------------------------
  // One-time restore of last session (results+map+scroll)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (hasRestored.current) return;
    hasRestored.current = true;

    const last = getLast();
    if (last?.results?.length) {
      setProperties(Array.isArray(last.results) ? last.results : []);
      if (last.params?.mode === "text") setQ(last.params.q || "");
      if (last.mapState) setMapRefState(last.mapState);
      markRestored(true);

      // restore scroll after paint
      requestAnimationFrame(() => {
        if (sidebarRef.current) {
          sidebarRef.current.scrollTop = sidebarScrollTop || 0;
        }
      });
    }
  }, [getLast, markRestored, sidebarScrollTop]);

  // ---------------------------------------------------------------------------
  // Cache-aware search runner (text or nearby)
  // ---------------------------------------------------------------------------
  const runSearch = useCallback(
    async (params, { source } = {}) => {
      // Cancel any in-flight request
      if (currentAbortRef.current) {
        try {
          currentAbortRef.current.abort();
        } catch (_) {}
      }
      const controller = new AbortController();
      currentAbortRef.current = controller;

      setLoading(true);
      setSelected(null);

      // Cache check
      const cached = getResults(params);
      if (cached?.results?.length) {
        setProperties(cached.results);
        markRestored(true);
        setLoading(false);
        if (source === "agent") setAgentBanner(`Updated from voice agent (${params.mode})`);
        return;
      }

      try {
        const { data } = await api.get("/api/properties/search/", {
          params,
          signal: controller.signal,
        });

        const results = Array.isArray(data?.results) ? data.results : [];
        setProperties(results);

        // Persist results + current map snapshot (if we have one)
        saveResults(params, results, mapRefState || null);

        markRestored(false);
        if (source === "agent") setAgentBanner(`Updated from voice agent (${params.mode})`);
      } catch (err) {
        if (controller.signal.aborted) {
          // Silently ignore if this request was superseded
        } else {
          console.error("Search failed:", err);
          setProperties([]);
        }
      } finally {
        setLoading(false);
      }
    },
    [getResults, saveResults, mapRefState, markRestored]
  );

  // ---------------------------------------------------------------------------
  // Handlers for UI-initiated searches
  // ---------------------------------------------------------------------------
  const handleTextSearch = useCallback(
    (e) => {
      e?.preventDefault();
      const query = q.trim();
      if (!query || loading) return;
      runSearch({ mode: "text", q: query });
    },
    [q, loading, runSearch]
  );

  const handleAreaSearch = useCallback(() => {
    if (!mapBounds || loading) return;
    runSearch({
      mode: "nearby",
      ne: `${mapBounds?.neLat},${mapBounds?.neLng}`,
      sw: `${mapBounds?.swLat},${mapBounds?.swLng}`,
    });
  }, [mapBounds, loading, runSearch]);

  // ---------------------------------------------------------------------------
  // Persist map center/zoom on idle (also snapshot into store keyed by params)
  // ---------------------------------------------------------------------------
  const handleMapLoad = useCallback(
    (map) => {
      const save = () => {
        const center = map.getCenter();
        const zoom = map.getZoom();
        const mapState = { center: { lat: center.lat(), lng: center.lng() }, zoom };

        // Guess current params for associating map state
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
    },
    [q, mapBounds, saveMapState]
  );

  // ---------------------------------------------------------------------------
  // React to navigation like /dashboard?mode=text&q=24060 or nearby with sw/ne
  // (voice-agent "Approach A")
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const mode = (sp.get("mode") || "").toLowerCase();
    const qParam = (sp.get("q") || "").trim();
    const sw = sp.get("sw");
    const ne = sp.get("ne");

    // Only trigger if params actually changed meaningfully
    if (mode === "text" && qParam) {
      setQ(qParam);
      runSearch({ mode: "text", q: qParam }, { source: "agent" });
    } else if (mode === "nearby" && sw && ne) {
      runSearch({ mode: "nearby", sw, ne }, { source: "agent" });
    }
  }, [location.search, runSearch]);

  // ---------------------------------------------------------------------------
  // Optional postMessage bridge (keep if you want agent → UI without nav)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onMsg = (e) => {
      const msg = e?.data;
      if (msg?.type === "AGENT_RESULTS" && msg?.data) {
        const params = msg.params || { mode: "text", q: "" };
        const results = Array.isArray(msg.data?.results) ? msg.data.results : [];
        setQ(params.q || "");
        setProperties(results);
        markRestored(false);
        setAgentBanner("Updated from voice agent");
      }
      if (msg?.type === "AGENT_SEARCH" && msg?.params) {
        runSearch(msg.params, { source: "agent" });
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [runSearch, markRestored]);

  // ---------------------------------------------------------------------------
  // UX niceties: clear banner after a bit; persist sidebar scroll on unmount
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!agentBanner) return;
    const id = setTimeout(() => setAgentBanner(null), 3500);
    return () => clearTimeout(id);
  }, [agentBanner]);

  useEffect(() => {
    return () => {
      if (sidebarRef.current) setSidebarScroll(sidebarRef.current.scrollTop || 0);
      // cancel any in-flight request to avoid setState on unmounted component
      if (currentAbortRef.current) {
        try {
          currentAbortRef.current.abort();
        } catch (_) {}
      }
    };
  }, [setSidebarScroll]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
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
            placeholder="Search city or zip (e.g., 24060)"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleTextSearch(e);
            }}
            style={{ flex: 1, padding: 8 }}
            aria-label="Search city or zip"
          />
        {/* NOTE: HTML forms submit on Enter automatically; the onKeyDown above is just a helper */}
          <button type="submit" disabled={loading} aria-busy={loading}>
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

        {/* Agent banner (tiny feedback when voice agent triggers updates) */}
        {agentBanner && (
          <div
            role="status"
            style={{
              background: "#f0f9ff",
              border: "1px solid #bae6fd",
              color: "#075985",
              padding: "6px 8px",
              borderRadius: 6,
              marginBottom: 10,
              fontSize: 12,
            }}
          >
            {agentBanner}
          </div>
        )}

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

                {/* Prefer the backend photo proxy when we have a Places v1 photo name */}
                {(() => {
                  const src = buildPhotoSrc(p);
                  return src ? (
                    <img
                      src={src}
                      alt={p.name || "Apartment photo"}
                      style={{
                        width: "100%",
                        height: 140,
                        objectFit: "cover",
                        borderRadius: 6,
                        marginTop: 8,
                      }}
                      loading="lazy"
                    />
                  ) : null;
                })()}

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
