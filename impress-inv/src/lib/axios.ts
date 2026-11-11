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
      // The desktop software marks its requests so the backend can use LIVE first and LOCAL when offline.
      // Requests without this marker (web browser) always use the LIVE database.
      if ((window as any).appConfig?.isElectron) {
        config.headers["X-Requested-With"] = "impress-desktop";
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
    console.error("[API request error]", {
      method: error.config?.method,
      url: error.config?.url,
      baseURL: error.config?.baseURL,
      status: error.response?.status,
      data: error.response?.data,
      message: error.message,
    });
    // A wrong password on the login form is a 401 too, but it is not an expired session: do not log out for it
    const isLoginRequest = String(error.config?.url || "").includes("/auth/login");
    if (error.response?.status === 401 && typeof window !== "undefined" && !isLoginRequest) {
      // A request that was sent with an older token must not log out a newer login
      const sentAuthorization = error.config?.headers?.Authorization;
      const currentToken = localStorage.getItem("token");
      if (sentAuthorization && currentToken && sentAuthorization !== `Bearer ${currentToken}`) {
        return Promise.reject(error);
      }

      const sessionReplaced = error.response?.data?.code === "SESSION_REPLACED";
      localStorage.removeItem("token");
      window.dispatchEvent(
        new CustomEvent("unauthorized", {
          detail: {
            redirect: "/auth/login",
            sessionReplaced,
          },
        })
      );
    }
    return Promise.reject(error);
  }
);

export default axiosInstance;