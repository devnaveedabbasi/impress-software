import { useSelector } from "react-redux";
import { RootState } from "@/store"; // Assuming RootState is exported from store/index.ts

export function usePermissions() {
  const user = useSelector((state: RootState) => state.auth.user);

  const hasPermission = (operationName: string, permissionName: string) => {
    if (!user) return false;

    // A super admin has full access. An admin only has the permissions it was given (listed in user.permissions)
    if (user.role?.toLowerCase() === "super_admin") return true;

    // Check if the user has the required permission
    return user.permissions?.some(
      (p) =>
        p.operation.toLowerCase() === operationName.toLowerCase() &&
        p.name.toLowerCase() === permissionName.toLowerCase()
    ) || false;
  };

  const isSuperAdmin = user?.role?.toLowerCase() === "super_admin";

  return { hasPermission, user, isSuperAdmin };
}
