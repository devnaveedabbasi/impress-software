import jwt from "jsonwebtoken";
import prisma from "../config/prisma.js";
import config from "../config/index.js";

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

    console.log("DECODED TOKEN:", decoded);


    if (!decoded.userId) {
      return res.status(401).json({
        success: false,
        message: "Invalid token structure",
      });
    }

    const user = await prisma.user.findUnique({
      where: {
        id: Number(decoded.userId),
      },
      select: {
        id: true,
        name: true,
        email: true,
        token: true,
        role: {
          include: {
            permissions: {
              include: {
                permission: true,
              },
            },
          },
        },
        permissions: {
          include: {
            permission: true,
          },
        },

        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "User not found",
      });
    }

    if (user.token !== token) {
      return res.status(401).json({
        success: false,
        message: "Token is invalid or user is logged out",
      });
    }

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

    // If user is Admin, they get full access, skipping the permission check
    const roleName = req.user.role?.name?.toLowerCase();
    console.log('roleName', roleName)
    if (roleName === "admin") {
      return next();
    }

    const rolePermissions = req.user.role?.permissions?.map(
      (p) => `${p.permission.operation}:${p.permission.name}`
    ) || [];

    const specificUserPermissions = req.user.permissions?.map(
      (p) => `${p.permission.operation}:${p.permission.name}`
    ) || [];

    const userPermissions = [...new Set([...rolePermissions, ...specificUserPermissions])];

    const hasPermission = permissions.some((p) => userPermissions.includes(p));

    if (!hasPermission) {
      return res.status(403).json({
        success: false,
        message: `Access denied. Required permissions: ${permissions.join(
          ", "
        )}`,
      });
    }
    next();
  };
};

export {
  authorizeToken,
  authorizeRoles,
  checkPermission,
};