"use client";

import { Provider } from "react-redux";
import { store } from ".";
import { AuthGuard } from "@/components/layout/AuthGuard";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <Provider store={store}>
      <AuthGuard>{children}</AuthGuard>
    </Provider>
  );
}