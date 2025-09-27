// src/pages/ListingPage.jsx
import React, { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api";
import NearbyExplorer from "../components/NearbyExplorer";

export default function ListingPage() {
  const { id } = useParams();                       // Google place_id
  const navigate = useNavigate();
  const passed = useLocation().state?.place || null;

  const [place, setPlace] = useState(passed);
  const [loading, setLoading] = useState(!passed);
  const [error, setError] = useState("");

  const hasCoords = useMemo(() => {
    const lat = Number(place?.lat);
    const lng = Number(place?.lng);
    return Number.isFinite(lat) && Number.isFinite(lng);
  }, [place]);

  useEffect(() => {
    if (passed) return; // we already have data from list click
    const controller = new AbortController();

    (async () => {
      try {
        setLoading(true);
        setError("");
        // 👇 no include=summary
        const { data } = await api.get(`/api/properties/${id}/`, {
          signal: controller.signal,
        });
        setPlace(data);
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("Failed to fetch listing details:", err);
          setError("Unable to load listing details.");
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();

    return () => controller.abort();
  }, [id, passed]);

  if (!place && loading) return <PageContainer><div>Loading…</div></PageContainer>;
  if (!place && error)   return <PageContainer><div style={{ color: "red" }}>{error}</div></PageContainer>;
  if (!place)            return <PageContainer><div>Listing not found.</div></PageContainer>;

  return (
    <PageContainer>
      <button onClick={() => navigate(-1)} style={{ marginBottom: 12 }}>← Back</button>

      <h1 style={{ margin: "4px 0 8px" }}>{place.name || "Apartment"}</h1>
      {place.address && <div style={{ color: "#555", marginBottom: 8 }}>{place.address}</div>}

      {(place.rating != null || place.user_ratings_total != null) && (
        <div style={{ color: "#333", marginBottom: 12 }}>
          {place.rating != null && <>⭐ {place.rating}</>}{" "}
          {place.user_ratings_total != null && (
            <span style={{ color: "#666" }}>({place.user_ratings_total})</span>
          )}
        </div>
      )}

      {place.image_url ? (
        <img
          src={place.image_url}
          alt={place.name || "Apartment photo"}
          style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 8, marginBottom: 12 }}
          loading="lazy"
        />
      ) : (
        <div style={styles.imageFallback}>No image available</div>
      )}

      {/* Quick actions */}
      <div style={styles.actionsRow}>
        {place.phone && <a href={`tel:${place.phone}`} style={styles.primaryBtn}>Call</a>}
        {place.website && <a href={place.website} target="_blank" rel="noreferrer" style={styles.secondaryBtn}>Website</a>}
        {place.url && <a href={place.url} target="_blank" rel="noreferrer" style={styles.secondaryBtn}>Google Maps</a>}
        {hasCoords && (
          <a
            href={`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`}
            target="_blank"
            rel="noreferrer"
            style={styles.secondaryBtn}
          >
            Directions
          </a>
        )}
        {place.address && (
          <button
            style={styles.ghostBtn}
            onClick={() => navigator.clipboard?.writeText(place.address).catch(() => {})}
            title="Copy address"
          >
            Copy address
          </button>
        )}
      </div>

      {/* Interactive Nearby Explorer */}
      {hasCoords && (
        <div style={{ marginBottom: 16 }}>
          <NearbyExplorer place={place} radius={1500} />
        </div>
      )}

      {/* Details grid */}
      <div style={styles.detailsGrid}>
        {place.phone && (
          <Detail title="Phone">
            <a href={`tel:${place.phone}`}>{place.phone}</a>
          </Detail>
        )}
        {place.website && (
          <Detail title="Website">
            <a href={place.website} target="_blank" rel="noreferrer">{place.website}</a>
          </Detail>
        )}
        {place.url && (
          <Detail title="Google Maps">
            <a href={place.url} target="_blank" rel="noreferrer">Open in Google Maps</a>
          </Detail>
        )}

        {hasCoords && (
          <NearbyExplorer lat={place.lat} lng={place.lng} />
        )}

      </div>
    </PageContainer>
  );
}

function PageContainer({ children }) {
  return <div style={{ maxWidth: 900, margin: "24px auto", padding: "0 16px" }}>{children}</div>;
}

function Detail({ title, children }) {
  return (
    <div>
      <div style={{ fontWeight: 600 }}>{title}</div>
      <div>{children}</div>
    </div>
  );
}

const styles = {
  imageFallback: {
    width: "100%",
    maxHeight: 360,
    display: "grid",
    placeItems: "center",
    background: "linear-gradient(180deg, #f6f7f9, #eef1f5)",
    color: "#888",
    borderRadius: 8,
    marginBottom: 12,
    border: "1px solid #eee",
    padding: 24,
  },
  actionsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  primaryBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    background: "#2563eb",
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "none",
  },
  secondaryBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    background: "#eef2ff",
    color: "#3730a3",
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "none",
  },
  ghostBtn: {
    padding: "8px 12px",
    borderRadius: 8,
    background: "transparent",
    color: "#333",
    fontWeight: 600,
    fontSize: 14,
    border: "1px solid #ddd",
  },
  mapShell: {
    height: 300,
    borderRadius: 8,
    overflow: "hidden",
    border: "1px solid #eee",
    marginBottom: 16,
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 16,
  },
};
