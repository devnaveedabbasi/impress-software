"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAppDispatch, useAppSelector } from "@/hooks/redux";
import api from "@/lib/axios";
import { USER_DETAILS } from "@/utlis/apiRoutes";
import { setCredentials, logoutUser } from "@/store/slices/auth";
import { Button } from "@/components/ui/Button";

const MAX_RETRIES = 2;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const statusOf = (error: unknown) => (error as { response?: { status?: number } }).response?.status;

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const dispatch = useAppDispatch();
  const { isAuthenticated } = useAppSelector((state) => state.auth);
  const [loading, setLoading] = useState(true);
  // The server could not be reached (or failed) while checking the session. The user is NOT logged out for this.
  const [connectionError, setConnectionError] = useState(false);
  const [retryKey, setRetryKey] = useState(0);

  useEffect(() => {
    const handleUnauthorized = (event: Event) => {
      const detail = (event as CustomEvent<{ redirect?: string }>).detail;
      dispatch(logoutUser());
      router.push(detail?.redirect || "/auth/login");
    };

    window.addEventListener("unauthorized", handleUnauthorized);
    return () => window.removeEventListener("unauthorized", handleUnauthorized);
  }, [dispatch, router]);

  useEffect(() => {
    let cancelled = false;

    const checkAuth = async () => {
      const token = localStorage.getItem("token");

      if (!token) {
        if (pathname !== "/auth/login") {
          dispatch(logoutUser());
          router.push("/auth/login");
        }
        setLoading(false);
        return;
      }

      // If we already have user in Redux, skip fetching
      if (isAuthenticated) {
        if (pathname === "/auth/login") {
          router.push("/");
        }
        setLoading(false);
        return;
      }

      try {
        let user;
        for (let attempt = 0; ; attempt++) {
          try {
            const { data } = await api.get(USER_DETAILS);
            user = data.data;
            break;
          } catch (error) {
            const status = statusOf(error);
            // A 4xx answer (401 etc.) is final. A network error or a 5xx may be temporary, so try again.
            if ((status && status < 500) || attempt >= MAX_RETRIES) throw error;
            await wait(1500 * (attempt + 1));
            if (cancelled) return;
          }
        }

        setConnectionError(false);
        dispatch(setCredentials({ user, token }));
        if (pathname === "/auth/login") {
          router.push("/");
        }
      } catch (error) {
        console.error("Auth check failed", error);
        if (statusOf(error) === 401) {
          // The session is really invalid: only now the user is logged out
          localStorage.removeItem("token");
          dispatch(logoutUser());
          if (pathname !== "/auth/login") {
            router.push("/auth/login");
          }
        } else {
          // Server unreachable / failing: keep the token so a refresh or Retry works, do not log out
          setConnectionError(true);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void checkAuth();
    return () => {
      cancelled = true;
    };
  }, [dispatch, router, pathname, isAuthenticated, retryKey]);

  // While the server cannot be reached, keep trying quietly. The page comes back by itself as soon as it answers.
  useEffect(() => {
    if (!connectionError) return;
    const timer = setInterval(() => setRetryKey((key) => key + 1), 5000);
    return () => clearInterval(timer);
  }, [connectionError]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100">
        <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent"></div>
      </div>
    );
  }

  if (connectionError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-zinc-100 p-4">
        <div className="w-full max-w-sm rounded-lg bg-white p-6 text-center shadow-xl">
          <h1 className="text-lg font-semibold text-zinc-900">Cannot reach the server</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Your session is safe. The server did not answer, trying again automatically. You can also check your
            internet connection and press Retry.
          </p>
          <div className="mt-5 flex flex-col gap-2">
            <Button
              type="button"
              shape="rounded"
              onClick={() => {
                setLoading(true);
                setRetryKey((key) => key + 1);
              }}
            >
              Retry
            </Button>
            <Button
              type="button"
              variant="secondary"
              shape="rounded"
              onClick={() => {
                localStorage.removeItem("token");
                dispatch(logoutUser());
                router.push("/auth/login");
              }}
            >
              Go to login
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Prevent flashing protected content if not authenticated and not on login page
  if (!isAuthenticated && pathname !== "/auth/login") {
    return null;
  }

  return <>{children}</>;
}
