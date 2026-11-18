"use client";

import { useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Provider } from "react-redux";
import { store } from ".";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAppDispatch } from "@/hooks/redux";
import { setIsSoftware } from "./slices/app";
import { AutoSyncManager } from "@/components/layout/AutoSyncManager";
import { NumberInputGuard } from "@/components/layout/NumberInputGuard";
import { FormErrorFocus } from "@/components/layout/FormErrorFocus";

function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const appConfig = (window as Window & {
        appConfig?: { isElectron?: boolean };
      }).appConfig;
      const isElectronApp = Boolean(appConfig?.isElectron);
      dispatch(setIsSoftware(isElectronApp));
    }
  }, [dispatch]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  // the cache of the server lists (TanStack Query): a list that was read a moment ago is not read again
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, retry: 1 } } })
  );
  return (
    <Provider store={store}>
      <QueryClientProvider client={queryClient}>
        <AppInitializer>
          <AutoSyncManager />
          <NumberInputGuard />
          <FormErrorFocus />
          <AuthGuard>{children}</AuthGuard>
        </AppInitializer>
      </QueryClientProvider>
    </Provider>
  );
}
