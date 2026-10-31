import prisma from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { hashPassword, comparePassword } from "../utils/password.js";

export const mapUserPermissions = (user) => {
    const allPermissions = [
        ...(user.role && user.role.permissions ? user.role.permissions.map(item => item.permission) : []),
        ...(user.permissions ? user.permissions.map(item => item.permission) : [])
    ];
    
    const uniquePermissionsMap = new Map();
    allPermissions.forEach(p => {
        if (!uniquePermissionsMap.has(p.id)) {
            uniquePermissionsMap.set(p.id, {
                id: p.id,
                name: p.name,
                operation: p.operation
            });
        }
    });
    return Array.from(uniquePermissionsMap.values());
};

const createUser = asyncHandler(async (req, res) => {
    const { name, email, password, roleId ,permissionIds} = req.body;

    if (!name || !email || !password || !roleId) {
        throw new ApiError(400, "Name, email, password, and roleId are required");
    }

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        throw new ApiError(409, "User with this email already exists");
    }

    const existingRole = await prisma.role.findUnique({ where: { id: parseInt(roleId) } });
    if (!existingRole) {
        throw new ApiError(404, "Role not found");
    }

    const hashedPassword = await hashPassword(password);

    const newUser = await prisma.user.create({
        data: {
            name,
            email,
            password: hashedPassword,
            roleId: parseInt(roleId),
            permissions: permissionIds && permissionIds.length > 0 ? {
                create: permissionIds.map(id => ({
                    permission: { connect: { id } }
                }))
            } : undefined
        },
        include: {
            role: {
                include: {
                    permissions: {
                        include: {
                            permission: true
                        }
                    }
                }
            },
            permissions: {
                include: {
                    permission: true
                }
            }
        },
    });
    

    const userResponse = {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role ? newUser.role.name : null,
        permissions: mapUserPermissions(newUser),
        createdAt: newUser.createdAt,
    };

    return res.status(201).json(
        new ApiResponse(201, userResponse, "User created successfully")
    );
});

const getAllUsers = asyncHandler(async (req, res) => {
    const users = await prisma.user.findMany({
        where: {
            role: {
                name: {
                    not: "admin",
                },
            },
        },
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

    const userResponse = users.map((user) => ({
        id: user.id,
        name: user.name,
        email: user.email,

        role: user.role ? user.role.name : null,

        permissions: mapUserPermissions(user),

        createdAt: user.createdAt,
    }));

    return res.status(200).json(
        new ApiResponse(
            200,
            userResponse,
            "Users fetched successfully"
        )
    );
});

const getUserById = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const user = await prisma.user.findUnique({
        where: {
            id: Number(id),
        },
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
        throw new ApiError(404, "User not found");
    }

    if (user.role && user.role.name === "admin") {
        throw new ApiError(403, "Access denied. Cannot view admin details.");
    }

    const userResponse = {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ? user.role.name : null,

        permissions: mapUserPermissions(user),

        createdAt: user.createdAt,
    };
    return res.status(200).json(
        new ApiResponse(
            200,
            userResponse,
            "User fetched successfully"
        )
    );
})

const updateUser = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, email, roleId, password, permissionIds } = req.body;
    
    const isSelfUpdate = req.user && String(req.user.id) === String(id);

    const existingUser = await prisma.user.findUnique({
        where: { id: Number(id) },
        include: { role: true },
    });

    if (!existingUser) {
        throw new ApiError(404, "User not found");
    }

    if (existingUser.role && existingUser.role.name === "admin") {
        throw new ApiError(403, "Access denied. Cannot update admin details.");
    }

    const updateData = {};
    if (name) {
        const nameRegex = /^[a-zA-Z ]+$/;
        if (!nameRegex.test(name)) {
            throw new ApiError(400, "Invalid name");
        }
        updateData.name = name;
    }

    if (email && email !== existingUser.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new ApiError(400, "Invalid email address");
        }

        const emailExists = await prisma.user.findUnique({
            where: { email },
        });

        if (emailExists) {
            throw new ApiError(409, "Email already taken by another user");
        }
        updateData.email = email;
    }

    if (password) {
        if (password.length < 6) {
            throw new ApiError(400, "Password must be at least 6 characters long");
        }
        const isSameAsOld = await comparePassword(password, existingUser.password);
        if (isSameAsOld) {
            throw new ApiError(400, "New password cannot be same as old password");
        }
        updateData.password = await hashPassword(password);
    }

    if (roleId && !isSelfUpdate) {
        const roleExists = await prisma.role.findUnique({
            where: { id: parseInt(roleId) },
        });
        if (!roleExists) {
            throw new ApiError(404, "Role not found");
        }
        updateData.roleId = parseInt(roleId);
    }

    if (permissionIds && Array.isArray(permissionIds) && !isSelfUpdate) {
        updateData.permissions = {
            deleteMany: {},
            create: permissionIds.map(id => ({
                permission: { connect: { id: parseInt(id) } }
            }))
        };
    }

    const updatedUser = await prisma.user.update({
        where: { id: Number(id) },
        data: updateData,
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
                    permission: true
                }
            }
        },
    });

    const userResponse = {
        id: updatedUser.id,
        name: updatedUser.name,
        email: updatedUser.email,
        role: updatedUser.role ? updatedUser.role.name : null,
        permissions: mapUserPermissions(updatedUser),
        createdAt: updatedUser.createdAt,
    };

    return res.status(200).json(
        new ApiResponse(
            200,
            userResponse,
            "User updated successfully"
        )
    );
})

const deleteUser = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const user = await prisma.user.findUnique({
        where: { id: Number(id) },
        include: { role: true },
    });

    if (!user) {
        throw new ApiError(404, "User not found");
    }

    if (user.role && user.role.name === "admin") {
        throw new ApiError(403, "Access denied. Cannot delete admin.");
    }

    await prisma.user.delete({
        where: { id: Number(id) },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            null,
            "User deleted successfully"
        )
    );
})

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
        where: { id: Number(req.user.id) },
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
        where: { id: Number(req.user.id) },
        data: {
            password: hashedPassword,
        },
    });
    return res.status(200).json(
        new ApiResponse(
            200,
            updatedUser,
            "Password changed successfully"
        )
    );
});

// GET NEXT ID
const getNextId = asyncHandler(async (req, res) => {
    const lastUser = await prisma.user.findFirst({
        orderBy: { id: 'desc' }
    });
    const nextId = lastUser ? lastUser.id + 1 : 1;
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next User ID fetched successfully")
    );
});

export default {
    createUser,
    getAllUsers,
    getUserById,
    updateUser,
    deleteUser,
    changePassword,
    getNextId,
};  