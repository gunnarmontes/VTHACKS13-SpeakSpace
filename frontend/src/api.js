import axios from "axios";
import { ACCESS_TOKEN, REFRESH_TOKEN } from "./constants";

// Normalize base URL: ensure no trailing slash so relative paths behave predictably
const rawBase = import.meta.env.VITE_API_URL || "";
const baseURL = rawBase.replace(/\/+$/g, "");
const api = axios.create({
  baseURL,
  timeout: 15000,
});

const PUBLIC_PATHS = [
  "api/auth/register/",
  "api/auth/login/",
  "api/auth/refresh/",
  "api/auth/verify/",
];

// Attach token on requests
api.interceptors.request.use(
  (config) => {
    // Debug: log full URL being requested (helps catch double-slash issues)
    try {
      const fullUrl = new URL(config.url, config.baseURL || window.location.origin).toString();
      console.debug("API request:", config.method?.toUpperCase(), fullUrl);
    } catch (e) {
      // ignore URL parse errors
    }
    // Only attach token if not a public path
    const isPublic = PUBLIC_PATHS.some((path) => config.url.endsWith(path));
    if (!isPublic) {
      const token = localStorage.getItem(ACCESS_TOKEN);
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Handle 401s with refresh
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // if 401 and we haven’t retried yet
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN);
        if (refreshToken) {
          const { data } = await axios.post(
            `${import.meta.env.VITE_API_URL}/api/auth/refresh/`,
            { refresh: refreshToken }
          );

          localStorage.setItem(ACCESS_TOKEN, data.access);

          // retry original request with new token
          originalRequest.headers.Authorization = `Bearer ${data.access}`;
          return api(originalRequest);
        }
      } catch (refreshErr) {
        // clear storage if refresh fails
        localStorage.removeItem(ACCESS_TOKEN);
        localStorage.removeItem(REFRESH_TOKEN);
      }
    }

    return Promise.reject(error);
  }
);

export default api;
