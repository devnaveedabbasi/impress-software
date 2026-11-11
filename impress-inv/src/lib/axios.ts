import axios, { type AxiosAdapter, type AxiosResponse } from "axios";

// ---- Response cache -------------------------------------------------------------------------------------------
// A page's data is fetched from the server ONCE and kept in memory. Opening the same page again, going back, or
// opening a print page re-uses it, nothing is loaded twice. The cache is emptied when:
//   - the browser page is refreshed (F5 / reload), because memory starts empty again
//   - anything is saved, changed or deleted (POST / PUT / PATCH / DELETE), so the next read is always fresh
// Not cached: sync status, "next id" lookups and anything that fails. A request can skip the cache with
// { headers: { "x-no-cache": "1" } }.
const MAX_CACHED = 150;
const cache = new Map<string, AxiosResponse>();
const inFlight = new Map<string, Promise<AxiosResponse>>();

const isCacheable = (url: string) => !/\/sync\/|next-id/.test(url);
const cacheKey = (config: { baseURL?: string; url?: string; params?: unknown; headers?: unknown }) => {
  const headers = (config.headers ?? {}) as { Authorization?: string; get?: (name: string) => unknown };
  // The key includes the login, so another user on the same browser never sees this user's data
  const auth = String(headers.Authorization ?? headers.get?.("Authorization") ?? "");
  return `${auth}|${config.baseURL ?? ""}|${config.url ?? ""}|${JSON.stringify(config.params ?? {})}`;
};
const copyOf = (response: AxiosResponse): AxiosResponse => ({
  ...response,
  // Pages may sort or edit what they receive, so each one gets its own copy
  data: typeof structuredClone === "function" ? structuredClone(response.data) : JSON.parse(JSON.stringify(response.data)),
});

export function clearApiCache() {
  cache.clear();
  inFlight.clear();
}

const defaultAdapter = axios.getAdapter(axios.defaults.adapter);
const cachingAdapter: AxiosAdapter = async (config) => {
  const method = String(config.method || "get").toLowerCase();

  if (method !== "get") {
    try {
      return await defaultAdapter(config);
    } finally {
      // Even a failed save may have changed something, so never keep old reads
      clearApiCache();
    }
  }

  const url = String(config.url || "");
  const skip = !isCacheable(url) || Boolean((config.headers as { get?: (n: string) => unknown })?.get?.("x-no-cache"));
  if (skip) return defaultAdapter(config);

  const key = cacheKey(config);
  const cached = cache.get(key);
  if (cached) return copyOf(cached);

  // The same request asked twice at the same time is sent once
  let pending = inFlight.get(key);
  if (!pending) {
    pending = defaultAdapter(config)
      .then((response) => {
        if (response.status >= 200 && response.status < 300 && inFlight.get(key) === pending) {
          if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
          cache.set(key, response);
        }
        return response;
      })
      .finally(() => {
        if (inFlight.get(key) === pending) inFlight.delete(key);
      });
    inFlight.set(key, pending);
  }
  return copyOf(await pending);
};

const axiosInstance = axios.create({
  adapter: cachingAdapter,
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