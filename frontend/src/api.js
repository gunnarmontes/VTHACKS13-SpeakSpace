import axios from "axios";

const RAW = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const BASE = RAW.replace(/\/+$/, ""); // strip trailing slash

const api = axios.create({
  baseURL: BASE,
  headers: { "Content-Type": "application/json" },
});

// Optional auth header if you use JWT
api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
