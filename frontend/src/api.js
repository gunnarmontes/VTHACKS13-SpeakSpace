// src/api.js
import axios from "axios";

const RAW = import.meta.env.VITE_API_URL || "http://127.0.0.1:8000";
const BASE = RAW.replace(/\/+$/, ""); // remove trailing slashes

const api = axios.create({
  baseURL: BASE, // e.g., https://your-backend.onrender.com
  headers: { "Content-Type": "application/json" },
  withCredentials: false,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access");
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export default api;
