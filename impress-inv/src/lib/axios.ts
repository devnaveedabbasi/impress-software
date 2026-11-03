import axios from "axios";
const axiosInstance = axios.create({
  baseURL:
    (typeof window !== "undefined" && (window as any).appConfig?.apiUrl
      ? (window as any).appConfig.apiUrl
      : process.env.NEXT_PUBLIC_API_BASE_URL || "http://127.0.0.1:5000") + "/api",
  headers: {
    "Content-Type": "application/json",
  },
});

// Request interceptor — token automatic
axiosInstance.interceptors.request.use(
  (config) => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("token");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// FormData interceptor — Content-Type automatic
axiosInstance.interceptors.request.use((config) => {
  if (config.data instanceof FormData) {
    config.headers["Content-Type"] = "multipart/form-data";
  }
  return config;
});

// Response interceptor
axiosInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("token");
      window.dispatchEvent(
        new CustomEvent("unauthorized", { detail: { redirect: "/auth/login" } })
      );
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;