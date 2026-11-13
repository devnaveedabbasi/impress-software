import prisma, { getInactiveDatabaseClient } from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import config from "../config/index.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { permissionsOfAccount } from "../utils/accountPermissions.js";
import { clearAuthCache } from "../middlewares/auth.middleware.js";

// The active database (LOCAL or LIVE) can switch at any time, so the session token is written to BOTH
// databases. Otherwise a token saved while LIVE was active is unknown to LOCAL and the user is logged out
// as soon as the backend switches database. The other database is best effort: it may be unreachable.
const OTHER_DATABASE_TIMEOUT_MS = 4000;

// accountType is "user" or "admin": they are different tables (an admin signs in from the Admin table).
const saveUserToken = async (userId, token, accountType = "user") => {
    const table = accountType === "admin" ? "admin" : "user";
    // Active database must succeed (login fails otherwise, like before)
    await prisma[table].update({ where: { id: userId }, data: { token } });
    clearAuthCache(userId, table);

    const other = getInactiveDatabaseClient();
    if (!other) return;

    const write = other[table]
        .update({ where: { id: userId }, data: { token } })
        .catch((error) => {
            // P2025 = the user does not exist in the other database yet (not synced), nothing to update
            if (error?.code !== "P2025") {
                console.warn("[Auth] Could not save session token in the other database:", error.message);
            }
        });
    const timeout = new Promise((resolve) => setTimeout(resolve, OTHER_DATABASE_TIMEOUT_MS));
    await Promise.race([write, timeout]);
};

// The signed-in account's table
const tableOf = (req) => (req.user.accountType === "admin" ? "admin" : "user");

// Creates the very first Super Admin (protected by the x-admin-secret header). Only works while no
// Super Admin exists. Further admins are created by a Super Admin from the Admins page.
const register = asyncHandler(async (req, res) => {
    const adminSecret = req.headers["x-admin-secret"];

    if (adminSecret !== config.adminSecret) {
        throw new ApiError(403, "Unauthorized admin registration");
    }

    const { name, email, password } = req.body;

    if (!name || !email || !password) {
        throw new ApiError(400, "Name, email and password are required");
    }
    if (password.length < 6) {
        throw new ApiError(400, "Password must be at least 6 characters long");
    }

    const emailTaken =
        (await prisma.admin.findUnique({ where: { email } })) || (await prisma.user.findUnique({ where: { email } }));
    if (emailTaken) {
        throw new ApiError(409, "An account with this email already exists");
    }

    const existingSuperAdmin = await prisma.admin.findFirst({ where: { role: "SUPER_ADMIN" } });
    if (existingSuperAdmin) {
        throw new ApiError(409, "Super admin already exists");
    }

    const admin = await prisma.admin.create({
        data: {
            name,
            email,
            password: await hashPassword(password),
            role: "SUPER_ADMIN",
            isSystem: true,
        },
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            { id: admin.id, name: admin.name, email: admin.email, role: "super_admin", createdAt: admin.createdAt },
            "Super admin registered successfully"
        )
    );
});


const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }

    // Admins sign in from the Admin table, everyone else from the User table
    const permissionInclude = { include: { permission: true } };
    const admin = await prisma.admin.findUnique({
        where: { email },
        include: { permissions: permissionInclude },
    });
    const user = admin
        ? null
        : await prisma.user.findUnique({
              where: { email },
              include: {
                  role: { include: { permissions: permissionInclude } },
                  permissions: permissionInclude,
              },
          });

    const account = admin || user;
    if (!account) {
        throw new ApiError(401, "User not found");
    }

    const isPasswordValid = await comparePassword(password, account.password);
    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid email or password");
    }

    const accountType = admin ? "admin" : "user";
    const roleName = admin ? (admin.role === "SUPER_ADMIN" ? "super_admin" : "admin") : user.role ? user.role.name : null;
    const permissions = await permissionsOfAccount(
        admin ? { ...admin, isSuperAdmin: admin.role === "SUPER_ADMIN" } : user
    );

    const token = signToken(account.id, roleName ? [roleName] : [], accountType);
    await saveUserToken(account.id, token, accountType);

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user: {
                    id: account.id,
                    name: account.name,
                    email: account.email,
                    role: roleName,
                    accountType,
                    permissions,
                },
                token,
            },
            "Login successful"
        )
    );
});

const getCurrentUser = asyncHandler(async (req, res) => {
    // req.user contains role and user permissions fetched by auth.middleware.js
    const combinedPermissions = await permissionsOfAccount(req.user);

    const userResponse = {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role ? req.user.role.name : null,
        accountType: req.user.accountType,
        permissions: combinedPermissions,
    };
    return res.status(200).json(
        new ApiResponse(
            200,
            userResponse,
            "User fetched successfully"
        )
    );
});

const logout = asyncHandler(async (req, res) => {
    const table = tableOf(req);
    const user = await prisma[table].findUnique({
        where: { id: Number(req.user.id) },
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }
    await saveUserToken(user.id, null, table);
    return res.status(200).json(
        new ApiResponse(
            200,
            [],
            "User logged out successfully"
        )
    );
});

const updateProfile = asyncHandler(async (req, res) => {
    const { name, email } = req.body;


    if (name) {
        const nameRegex = /^[a-zA-Z ]+$/;
        if (!nameRegex.test(name)) {
            throw new ApiError(
                400,
                "Invalid name"
            );
        }
    }

    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    if (email && !emailRegex.test(email)) {
        throw new ApiError(
            400,
            "Invalid email address"
        );
    }

    // Check if email already exists (and is not the current user's email)
    // An email is unique across admins and users, so sign-in always finds exactly one account
    if (email) {
        const table = tableOf(req);
        const [sameTable, otherTable] = await Promise.all([
            prisma[table].findFirst({ where: { email, id: { not: req.user.id } } }),
            prisma[table === "admin" ? "user" : "admin"].findUnique({ where: { email } }),
        ]);
        if (sameTable || otherTable) {
            throw new ApiError(
                409,
                "Email already taken by another user"
            );
        }
    }

    const user = await prisma[tableOf(req)].update({
        where: { id: req.user.id },
        data: { name, email },
    });
    return res.status(200).json(
        new ApiResponse(
            200,
            user,
            "User updated successfully"
        )
    );
});

const changePassword = asyncHandler(async (req, res) => {
    const { oldPassword, newPassword } = req.body;

    if (!oldPassword || !newPassword) {
        throw new ApiError(
            400,
            "Old password and new password are required"
        );
    }

    if (oldPassword === newPassword) {
        throw new ApiError(
            400,
            "New password cannot be same as old password"
        );
    }

    const user = await prisma[tableOf(req)].findUnique({
        where: { id: req.user.id },
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    const isPasswordValid = await comparePassword(oldPassword, user.password);
    if (!isPasswordValid) {
        throw new ApiError(
            400,
            "Old password is incorrect"
        );
    }

    if (newPassword.length < 6) {
        throw new ApiError(
            400,
            "New password must be at least 6 characters long"
        );
    }

    const isSameAsOld = await comparePassword(newPassword, user.password);
    if (isSameAsOld) {
        throw new ApiError(
            400,
            "New password cannot be same as old password"
        );
    }

    const hashedPassword = await hashPassword(newPassword);
    await prisma[tableOf(req)].update({
        where: { id: req.user.id },
        data: {
            password: hashedPassword,
        },
    });
    return res.status(200).json(
        new ApiResponse(
            200,
            [],
            "Password changed successfully"
        )
    );
});

export default {
    register,
    login,
    logout,
    getCurrentUser,
    updateProfile,
    changePassword,
};