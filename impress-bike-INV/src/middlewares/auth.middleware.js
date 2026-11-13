import jwt from "jsonwebtoken";
import prisma, { getInactiveDatabaseClient } from "../config/prisma.js";
import config from "../config/index.js";
import { requiredPermissionKeys } from "../utils/accountPermissions.js";

// The signed-in user (with role and permissions) is read from the database on every request, which is slow when
// the database is far away. A few seconds of memory removes most of those reads. Login / logout clear it.
const USER_CACHE_MS = 10000;
const userCache = new Map();
// Admins and normal users are different tables, so their ids can be equal: the cache key includes the type.
const cacheKey = (id, accountType) => `${accountType === "admin" ? "admin" : "user"}:${Number(id)}`;
export const clearAuthCache = (userId, accountType = "user") => {
  if (userId === undefined) userCache.clear();
  else userCache.delete(cacheKey(userId, accountType));
};

const permissionInclude = { include: { permission: true } };

// Loads the signed-in account. An admin is shaped like a user (role + permissions) so the rest of the
// backend keeps working: a super admin gets a flag, an admin gets only the permissions given to it.
const loadAccount = async (db, id, accountType) => {
  if (accountType === "admin") {
    const admin = await db.admin.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        token: true,
        role: true,
        permissions: permissionInclude,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!admin) return null;
    const { role: adminRole, ...rest } = admin;
    return {
      ...rest,
      accountType: "admin",
      adminRole,
      isSuperAdmin: adminRole === "SUPER_ADMIN",
      role: { name: adminRole === "SUPER_ADMIN" ? "super_admin" : "admin", permissions: [] },
    };
  }
  const user = await db.user.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      email: true,
      token: true,
      role: { include: { permissions: permissionInclude } },
      permissions: permissionInclude,
      createdAt: true,
      updatedAt: true,
    },
  });
  return user ? { ...user, accountType: "user", isSuperAdmin: false } : null;
};

const authorizeToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Access denied. No token provided.",
      });
    }

    const token = authHeader.split(" ")[1];

    const decoded = jwt.verify(token, config.jwt.secret);


    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token structure",
      });
    }

    const accountType = decoded.accountType === "admin" ? "admin" : "user";
    const key = cacheKey(decoded.userId, accountType);
    const cachedUser = userCache.get(key);
    const fresh = cachedUser && Date.now() - cachedUser.at < USER_CACHE_MS && cachedUser.user.token === token;

    const user = fresh ? { ...cachedUser.user } : await loadAccount(prisma, Number(decoded.userId), accountType);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.token !== token) {
      // The token may have been issued while the other database was active (e.g. LIVE was unreachable at
      // login). Accept it when the other database knows it, and copy it here so this database knows it too.
      const other = getInactiveDatabaseClient();
      if (other && token) {
        try {
          const otherUser = await Promise.race([
            other[accountType].findUnique({ where: { id: user.id }, select: { token: true } }),
            new Promise((resolve) => setTimeout(() => resolve(null), 6000)),
          ]);
          if (otherUser?.token === token) {
            await prisma[accountType].update({ where: { id: user.id }, data: { token } });
            user.token = token;
          }
        } catch (error) {
          console.warn("[Auth] Could not check the session token in the other database:", error.message);
        }
      }
    }

    if (!user.token || user.token !== token) {
      return res.status(401).json({
        success: false,
        code: "SESSION_REPLACED",
        message: "This account was signed in on another device.",
      });
    }

    userCache.set(key, { at: Date.now(), user: { ...user } });
    req.user = user;

    next();

  } catch (error) {

    if (error.name === "TokenExpiredError") {
      return res.status(401).json({
        success: false,
        message: "Token has expired. Please login again.",
      });
    }

    if (error.name === "JsonWebTokenError") {
      return res.status(401).json({
        success: false,
        message: "Invalid token",
      });
    }

    console.error("Auth middleware error:", error);

    return res.status(500).json({
      success: false,
      message: "Authentication failed",
    });
  }
};


const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    const userRoles = req.user.role ? [req.user.role.name] : [];

    const hasRole = allowedRoles.some(
      (role) => userRoles.includes(role)
    );

    if (!hasRole) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required roles: ${allowedRoles.join(", ")}`,
      });
    }

    next();
  };
};

const checkPermission = (...permissions) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
      });
    }

    // A super admin has every permission. An admin only has the ones a super admin gave it.
    if (req.user.isSuperAdmin) {
      return next();
    }

    const rolePermissions = req.user.role?.permissions?.map(
      (p) => `${p.permission.operation}:${p.permission.name}`
    ) || [];

    const specificUserPermissions = req.user.permissions?.map(
      (p) => `${p.permission.operation}:${p.permission.name}`
    ) || [];

    const userPermissions = [...new Set([...rolePermissions, ...specificUserPermissions])];

    const hasPermission = permissions.some((permission) => {
      const required = requiredPermissionKeys(permission);
      return required.every((requiredPermission) => userPermissions.includes(requiredPermission));
    });

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permissions: ${permissions.join(", ")}`,
      });
    }
    next();
  };
};

// Only a super admin may pass (admin management)
const authorizeSuperAdmin = (req, res, next) => {
  if (!req.user?.isSuperAdmin) {
    return res.status(403).json({
      success: false,
      message: "Access denied. Only a super admin can do this.",
    });
  }
  next();
};

export {
  authorizeToken,
  authorizeSuperAdmin,
  authorizeRoles,
  checkPermission,
};