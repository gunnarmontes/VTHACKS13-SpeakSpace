// src/pages/Dashboard.jsx
import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import api from "../api";
import MapView from "../components/MapView";
import { useSearchStore } from "../searchStore";

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
  const navigate = useNavigate();

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
  const mapRef = useRef(null); // keep the real map instance for agent map commands

  // Axios cancellation per runSearch to avoid race-y state updates
  const currentAbortRef = useRef(null);

  // Base URL for absolute image URLs
  const API_BASE = useMemo(() => {
    const raw = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
    return raw.replace(/\/+$/, "");
  }, []);

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
      if (currentAbortRef.current) {
        try {
          currentAbortRef.current.abort();
        } catch {}
      }
      const controller = new AbortController();
      currentAbortRef.current = controller;

      setLoading(true);
      setSelected(null);

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
        if (!controller.signal.aborted) {
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
  // UI search handlers
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
  // Persist map center/zoom on idle
  // ---------------------------------------------------------------------------
  const handleMapLoad = useCallback(
    (map) => {
      mapRef.current = map;
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
    },
    [q, mapBounds, saveMapState]
  );

  // ---------------------------------------------------------------------------
  // React to navigation like /dashboard?mode=text&q=24060 (Approach A)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const mode = (sp.get("mode") || "").toLowerCase();
    const qParam = (sp.get("q") || "").trim();
    const sw = sp.get("sw");
    const ne = sp.get("ne");

    if (mode === "text" && qParam) {
      setQ(qParam);
      runSearch({ mode: "text", q: qParam }, { source: "agent" });
    } else if (mode === "nearby" && sw && ne) {
      runSearch({ mode: "nearby", sw, ne }, { source: "agent" });
    }
  }, [location.search, runSearch]);

  // ---------------------------------------------------------------------------
  // Agent → UI bridge (results, searches, and UI commands)
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const onMsg = (e) => {
      const msg = e?.data;
      if (!msg) return;

      // 1) Agent pushed results directly
      if (msg.type === "AGENT_RESULTS" && msg.data) {
        const params = msg.params || { mode: "text", q: "" };
        const results = Array.isArray(msg.data?.results) ? msg.data.results : [];
        setQ(params.q || "");
        setProperties(results);
        markRestored(false);
        setAgentBanner("Updated from voice agent");
        return;
      }

      // 2) Agent asked app to perform a search
      if (msg.type === "AGENT_SEARCH" && msg.params) {
        runSearch(msg.params, { source: "agent" });
        return;
      }

      // 3) Agent UI commands
      if (msg.type === "AGENT_UI" && msg.action) {
        const a = msg.action.toUpperCase();
        const p = msg.payload || {};

        if (a === "OPEN_LISTING" && p.id) {
          const found = properties.find((x) => x.id === p.id) || null;
          navigate(`/listing/${p.id}`, { state: { place: found || undefined } });
          return;
        }

        if (a === "SELECT_BY_ID" && p.id) {
          const found = properties.find((x) => x.id === p.id) || null;
          if (found) setSelected(found);
          return;
        }

        if (a === "FOCUS_MAP") {
          const lat = Number(p.lat);
          const lng = Number(p.lng);
          const zoom = p.zoom != null ? Number(p.zoom) : undefined;
          if (mapRef.current && !Number.isNaN(lat) && !Number.isNaN(lng)) {
            mapRef.current.panTo({ lat, lng });
            if (!Number.isNaN(zoom)) mapRef.current.setZoom(zoom);
          }
          return;
        }

        if (a === "NAVIGATE_SEARCH" && p.mode) {
          // Change URL so the existing effect kicks off the search (Approach A)
          const sp = new URLSearchParams();
          sp.set("mode", p.mode);
          if (p.mode === "text" && p.q) sp.set("q", p.q);
          if (p.mode === "nearby" && p.sw && p.ne) {
            sp.set("sw", p.sw);
            sp.set("ne", p.ne);
          }
          navigate(`/dashboard?${sp.toString()}`, { replace: false });
          return;
        }

        if (a === "SHOW_BANNER" && p.text) {
          setAgentBanner(String(p.text).slice(0, 200));
          return;
        }
      }
    };

    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [navigate, properties, runSearch, markRestored]);

  // ---------------------------------------------------------------------------
  // UX niceties
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!agentBanner) return;
    const id = setTimeout(() => setAgentBanner(null), 3500);
    return () => clearTimeout(id);
  }, [agentBanner]);

  useEffect(() => {
    return () => {
      if (sidebarRef.current) setSidebarScroll(sidebarRef.current.scrollTop || 0);
      if (currentAbortRef.current) {
        try {
          currentAbortRef.current.abort();
        } catch {}
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

                {p.photoName ? (
                  <img
                    src={`${API_BASE}/api/places/photo?name=${encodeURIComponent(
                      p.photoName
                    )}&maxwidth=640&maxheight=400`}
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
                ) : p.image_url ? (
                  <img
                    src={p.image_url}
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
                ) : null}
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
          fitToResults={!mapRefState}
          onMapLoad={handleMapLoad}
          onBoundsChange={setMapBounds}
        />
      </main>
    </div>
  );
}
