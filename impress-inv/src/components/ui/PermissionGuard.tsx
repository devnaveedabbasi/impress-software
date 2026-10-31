"use client";

import { usePermissions } from "@/hooks/usePermissions";
import { ReactNode } from "react";

interface PermissionGuardProps {
  operation: string;
  name: string;
  children: ReactNode;
  fallback?: ReactNode;
}

export function PermissionGuard({ operation, name, children, fallback = null }: PermissionGuardProps) {
  const { hasPermission, user } = usePermissions();

  // If user is not logged in yet, we can either return fallback or nothing
  if (!user) return <>{fallback}</>;

  if (hasPermission(operation, name)) {
    return <>{children}</>;
  }

  return <>{fallback}</>;
}
