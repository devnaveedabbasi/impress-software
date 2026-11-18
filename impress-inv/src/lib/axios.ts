import axios, { type AxiosAdapter, type AxiosResponse } from "axios";

// ---- Response cache -------------------------------------------------------------------------------------------
// A page's data is fetched from the server ONCE and kept in memory. Opening the same page again, going back, or
// opening a print page re-uses it, nothing is loaded twice. The cache is emptied when:
//   - the browser page is refreshed (F5 / reload), because memory starts empty again
//   - anything is saved, changed or deleted (POST / PUT / PATCH / DELETE), so the next read is always fresh
// Not cached: sync status, "next id" lookups and anything that fails. A request can skip the cache with
// { headers: { "x-no-cache": "1" } }.
//
// A print page opens in a NEW browser tab, which starts with empty memory. So a request can also ask to be kept in
// the browser's storage for a short time ({ persistMs: 300000 }): the next print tab then re-uses it instead of
// asking the server again. It is dropped by the same rules (any save, logout) and when its time is over.
declare module "axios" {
  interface AxiosRequestConfig {
    persistMs?: number;
  }
}
const PERSIST_PREFIX = "api-persist:";
const PERSIST_MAX_CHARS = 2_000_000; // a bigger answer is not kept (the storage of a browser is small)

const readPersisted = (key: string, config: Parameters<AxiosAdapter>[0]): AxiosResponse | null => {
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    const entry = JSON.parse(raw) as { until: number; data: unknown };
    if (Date.now() > entry.until) {
      localStorage.removeItem(PERSIST_PREFIX + key);
      return null;
    }
    return { data: entry.data, status: 200, statusText: "OK", headers: {}, config, request: {} } as AxiosResponse;
  } catch {
    return null;
  }
};

const clearPersisted = () => {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const name = localStorage.key(i);
      if (name?.startsWith(PERSIST_PREFIX)) localStorage.removeItem(name);
    }
  } catch {
    // the storage may be blocked: nothing was kept then
  }
};

const writePersisted = (key: string, data: unknown, ms: number) => {
  try {
    const text = JSON.stringify({ until: Date.now() + ms, data });
    if (text.length > PERSIST_MAX_CHARS) return;
    localStorage.setItem(PERSIST_PREFIX + key, text);
  } catch {
    clearPersisted(); // the storage is full: start again
  }
};

// A browser refresh (F5 / reload) always means "show me the newest": whatever was kept for the print pages is dropped
// when a page is loaded by a refresh. (A new tab opened by the Print button is not a refresh, so it re-uses the data.)
if (typeof window !== "undefined") {
  try {
    const navigation = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    if (navigation?.type === "reload") clearPersisted();
  } catch {
    // an old browser without this information: nothing to do
  }
}

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
  if (typeof window !== "undefined") clearPersisted();
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

  const persistMs = typeof window !== "undefined" ? config.persistMs ?? 0 : 0;
  if (persistMs > 0) {
    const kept = readPersisted(key, config);
    if (kept) return kept;
  }

  // The same request asked twice at the same time is sent once
  let pending = inFlight.get(key);
  if (!pending) {
    pending = defaultAdapter(config)
      .then((response) => {
        if (response.status >= 200 && response.status < 300 && inFlight.get(key) === pending) {
          if (cache.size >= MAX_CACHED) cache.delete(cache.keys().next().value as string);
          cache.set(key, response);
          if (persistMs > 0) writePersisted(key, response.data, persistMs);
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
      clearApiCache();
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