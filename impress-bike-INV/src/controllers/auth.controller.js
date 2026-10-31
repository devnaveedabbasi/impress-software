import prisma from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import config from "../config/index.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { comparePassword, hashPassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { mapUserPermissions } from "./user.controller.js";

const register = asyncHandler(async (req, res) => {

    const adminSecret = req.headers["x-admin-secret"];

    if (adminSecret !== config.adminSecret) {
        throw new ApiError(
            403,
            "Unauthorized admin registration"
        );
    }

    const { name, email, password } = req.body;

    // Validation
    if (!name || !email || !password) {
        throw new ApiError(
            400,
            "Name, email and password are required"
        );
    }

    // Check existing user
    const existingUser = await prisma.user.findUnique({
        where: {
            email,
        },
    });

    if (existingUser) {
        throw new ApiError(
            409,
            "User with this email already exists"
        );
    }

    if (password.length < 6) {
        throw new ApiError(
            400,
            "Password must be at least 6 characters long"
        );
    }

    // Find admin role
    let adminRole = await prisma.role.findUnique({
        where: {
            name: "admin",
        },
    });


    // If admin role does not exist, create it
    if (!adminRole) {
        adminRole = await prisma.role.create({
            data: {
                name: "admin",
            },
        });
    }


    // Check if an admin user already exists
    const existingAdmin = await prisma.user.findFirst({
        where: {
            roleId: adminRole.id,
        },
    });

    if (existingAdmin) {
        throw new ApiError(
            409,
            "Admin user already exists"
        );
    }


    // Hash password
    const hashedPassword = await hashPassword(password);


    // Create Admin User
    const user = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            roleId: adminRole.id,
        },

        include: {
            role: true,
        },
    });


    const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,

        role: user.role ? user.role.name : null,

        createdAt: user.createdAt,
    };


    return res.status(201).json(
        new ApiResponse(
            201,
            userResponse,
            "Admin registered successfully"
        )
    );
});


const login = asyncHandler(async (req, res) => {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
        throw new ApiError(400, "Email and password are required");
    }

    // Find user (with roles + permissions)
    const user = await prisma.user.findUnique({
        where: { email },
        include: {
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
        },
    });

    if (!user) {
        throw new ApiError(401, "User not found");
    }

    // Compare password
    const isPasswordValid = await comparePassword(password, user.password);

    if (!isPasswordValid) {
        throw new ApiError(401, "Invalid email or password");
    }

    // Use mapUserPermissions to flatten and deduplicate permissions from role and user
    const combinedPermissions = mapUserPermissions(user);

    // JWT mein role names bhejo (poora object nahi)
    const token = signToken(
        user.id,
        user.role ? [user.role.name] : []
    );

    // Token save karo
    await prisma.user.update({
        where: { id: user.id },
        data: { token },
    });

    const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ? user.role.name : null,
        permissions: combinedPermissions,
    };

    return res.status(200).json(
        new ApiResponse(
            200,
            {
                user: userResponse,
                token,
            },
            "Login successful"
        )
    );
});

const getCurrentUser = asyncHandler(async (req, res) => {
    // req.user contains role and user permissions fetched by auth.middleware.js
    const combinedPermissions = mapUserPermissions(req.user);

    const userResponse = {
        id: req.user.id,
        name: req.user.name,
        email: req.user.email,
        role: req.user.role ? req.user.role.name : null,
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
    const user = await prisma.user.findUnique({
        where: { id: Number(req.user.id) },
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }
    await prisma.user.update({
        where: { id: user.id },
        data: { token: null },
    });
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
    const existingUser = await prisma.user.findFirst({
        where: {
            email,
            id: {
                not: req.user.id,
            },
        },
    });

    if (existingUser) {
        throw new ApiError(
            409,
            "Email already taken by another user"
        );
    }

    const user = await prisma.user.update({
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

    const user = await prisma.user.findUnique({
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
    const updatedUser = await prisma.user.update({
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