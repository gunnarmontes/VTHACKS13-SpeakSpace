// src/searchStore.js
import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

const TTL_MS = 24 * 60 * 60 * 1000; // 24h
const MAX_KEYS = 10;

const buildKey = (params = {}) => {
  const { mode, q, sw, ne } = params || {};
  if (mode === "text") return `text:${(q || "").trim().toLowerCase()}`;
  if (mode === "nearby") return `nearby:${sw}|${ne}`;
  return JSON.stringify(params);
};

export const useSearchStore = create(
  persist(
    (set, get) => ({
      // cache: { [key]: { results, params, mapState, ts } }
      cache: {},
      lastKey: null,
      // UI bits
      lastRestored: false,
      sidebarScrollTop: 0,

      getKey: buildKey,

      _evictIfNeeded(cache) {
        // remove expired
        const now = Date.now();
        for (const k of Object.keys(cache)) {
          if (cache[k]?.ts && now - cache[k].ts > TTL_MS) {
            delete cache[k];
          }
        }
        // LRU if too many
        const keys = Object.keys(cache);
        if (keys.length > MAX_KEYS) {
          keys
            .sort((a, b) => (cache[a].ts || 0) - (cache[b].ts || 0))
            .slice(0, keys.length - MAX_KEYS)
            .forEach((k) => delete cache[k]);
        }
        return cache;
      },

      saveResults(params, results, mapState = null) {
        const key = buildKey(params);
        let cache = { ...get().cache };
        cache[key] = { results, params, mapState, ts: Date.now() };
        cache = get()._evictIfNeeded(cache);
        set({ cache, lastKey: key, lastRestored: false });
        return key;
      },

      getResults(params) {
        const key = buildKey(params);
        const entry = get().cache[key];
        if (!entry) return null;
        if (Date.now() - (entry.ts || 0) > TTL_MS) return null; // expired
        return entry;
      },

      getResultsOrLast(params) {
        const exact = params ? get().getResults(params) : null;
        if (exact) return exact;
        const last = get().getLast();
        if (!last) return null;
        return last;
      },

      getLast() {
        const { lastKey, cache } = get();
        if (!lastKey) return null;
        const entry = cache[lastKey];
        if (!entry) return null;
        if (Date.now() - (entry.ts || 0) > TTL_MS) return null;
        return entry;
      },

      saveMapState(paramsOrNull, mapState) {
        let key = paramsOrNull ? buildKey(paramsOrNull) : get().lastKey;
        if (!key) return;
        const cache = { ...get().cache };
        if (cache[key]) {
          cache[key] = { ...cache[key], mapState, ts: Date.now() };
          set({ cache, lastKey: key });
        }
      },

      // persist radius selections per-place id
      radiusByPlace: {},
      saveRadiusForPlace(placeId, radius) {
        const r = { ...(get().radiusByPlace || {}) };
        r[placeId] = Number(radius);
        set({ radiusByPlace: r });
      },
      getRadiusForPlace(placeId) {
        return (get().radiusByPlace || {})[placeId] || null;
      },

      // persist selected category per-place id
      categoryByPlace: {},
      saveCategoryForPlace(placeId, categoryKey) {
        const c = { ...(get().categoryByPlace || {}) };
        c[placeId] = categoryKey;
        set({ categoryByPlace: c });
      },
      getCategoryForPlace(placeId) {
        return (get().categoryByPlace || {})[placeId] || null;
      },

      setSidebarScroll(top) {
        set({ sidebarScrollTop: top ?? 0 });
      },

      markRestored(flag) {
        set({ lastRestored: !!flag });
      },

      clearAll() {
        set({ cache: {}, lastKey: null, lastRestored: false, sidebarScrollTop: 0 });
      },
    }),
    {
      name: "hf-search",
      storage: createJSONStorage(() => localStorage), // ⬅️ persist across sessions
    }
  )
);
