export function getApiBase() {
  const fallback = "https://vthacks13-speakspace.onrender.com";
  const raw = import.meta.env.VITE_API_URL || fallback;
  return raw.replace(/\/+$/, "");
}

export function buildPhotoSrc(p, { maxwidth = 640, maxheight = 400 } = {}) {
  if (!p) return null;
  const API_BASE = getApiBase();
  if (p.photoName) {
    return `${API_BASE}/api/places/photo?${new URLSearchParams({
      name: p.photoName,
      maxwidth: String(maxwidth),
      maxheight: String(maxheight),
    }).toString()}`;
  }
  if (p.image_url) {
    return p.image_url.startsWith("/api") ? `${API_BASE}${p.image_url}` : p.image_url;
  }
  return null;
}
