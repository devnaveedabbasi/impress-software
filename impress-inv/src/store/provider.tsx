"use client";

import { useEffect } from "react";
import { Provider } from "react-redux";
import { store } from ".";
import { AuthGuard } from "@/components/layout/AuthGuard";
import { useAppDispatch } from "@/hooks/redux";
import { setIsSoftware } from "./slices/app";

function AppInitializer({ children }: { children: React.ReactNode }) {
  const dispatch = useAppDispatch();

  useEffect(() => {
    if (typeof window !== "undefined") {
      const isElectronApp = Boolean((window as any).appConfig?.isElectron);
      dispatch(setIsSoftware(isElectronApp));
    }
  }, [dispatch]);

  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AppInitializer>
        <AuthGuard>{children}</AuthGuard>
      </AppInitializer>
    </Provider>
  );
}
