import prisma, { getActiveDatabaseClient } from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";
import { hashPassword } from "../utils/password.js";
import { clearAuthCache } from "../middlewares/auth.middleware.js";
import { assertCanGrant } from "../utils/accountPermissions.js";

// Admin management. Every route is for a Super Admin only (see admin.routes.js).

const adminInclude = { permissions: { include: { permission: true } } };

const toResponse = (admin) => ({
    id: admin.id,
    name: admin.name,
    email: admin.email,
    role: admin.role, // SUPER_ADMIN | ADMIN
    isSystem: admin.isSystem,
    roleLabel: admin.role === "SUPER_ADMIN" ? "Super Admin" : "Admin",
    permissions: (admin.permissions || []).map((item) => ({
        id: item.permission.id,
        name: item.permission.name,
        operation: item.permission.operation,
    })),
    createdAt: admin.createdAt,
});

// An email belongs to one account only (admins and users share the sign-in)
const assertEmailFree = async (email, exceptAdminId) => {
    const [admin, user] = await Promise.all([
        prisma.admin.findUnique({ where: { email } }),
        prisma.user.findUnique({ where: { email } }),
    ]);
    if ((admin && admin.id !== exceptAdminId) || user) {
        throw new ApiError(409, "An account with this email already exists");
    }
};

const assertPermissionsExist = async (permissionIds) => {
    if (permissionIds.length === 0) return;
    const found = await prisma.permission.count({ where: { id: { in: permissionIds } } });
    if (found !== new Set(permissionIds).size) {
        throw new ApiError(400, "One or more selected permissions do not exist");
    }
};

const getAllAdmins = asyncHandler(async (req, res) => {
    const admins = await prisma.admin.findMany({ orderBy: { id: "asc" }, include: adminInclude });
    return res.status(200).json(new ApiResponse(200, admins.map(toResponse), "Admins fetched successfully"));
});

const getAdminById = asyncHandler(async (req, res) => {
    const admin = await prisma.admin.findUnique({ where: { id: Number(req.params.id) }, include: adminInclude });
    if (!admin) throw new ApiError(404, "Admin not found");
    return res.status(200).json(new ApiResponse(200, toResponse(admin), "Admin fetched successfully"));
});

const getNextId = asyncHandler(async (req, res) => {
    const { _max } = await prisma.admin.aggregate({ _max: { id: true } });
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(new ApiResponse(200, { nextId: (_max.id || 0) + 1 }, "Next Admin ID fetched successfully"));
});

const createAdmin = asyncHandler(async (req, res) => {
    const { name, email, password, role, permissionIds } = req.body;

    if (role === "SUPER_ADMIN") {
        throw new ApiError(403, "The system Super Admin can only be created by the seed");
    }

    await assertEmailFree(email);
    const grants = role === "SUPER_ADMIN" ? [] : [...new Set(permissionIds)];
    await assertCanGrant(req.user, grants);
    await assertPermissionsExist(grants);

    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Admin"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Admin"), 1),
            EXISTS(SELECT 1 FROM "Admin")
        )
    `;

    const admin = await prisma.admin.create({
        data: {
            name,
            email,
            password: await hashPassword(password),
            role,
            permissions: { create: grants.map((permissionId) => ({ permissionId })) },
        },
        include: adminInclude,
    });

    return res.status(201).json(new ApiResponse(201, toResponse(admin), "Admin created successfully"));
});

const updateAdmin = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { name, email, password, role, permissionIds } = req.body;

    const existing = await prisma.admin.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Admin not found");

    if (existing.isSystem) {
        throw new ApiError(403, "The system Super Admin cannot be changed");
    }

    // Nobody can lower their own role (it could leave the system without a Super Admin)
    if (existing.id === req.user.id && role !== existing.role) {
        throw new ApiError(400, "You cannot change your own role");
    }
    if (role === "SUPER_ADMIN") {
        throw new ApiError(403, "The system Super Admin is the only allowed Super Admin");
    }

    if (email !== undefined && email !== existing.email) {
        await assertEmailFree(email, id);
    }

    if (role === "SUPER_ADMIN") {
        throw new ApiError(403, "The system Super Admin is the only allowed Super Admin");
    }

    const data = {};
    if (name !== undefined) data.name = name;
    if (email !== undefined) data.email = email;
    if (role !== undefined) data.role = role;
    if (password) data.password = await hashPassword(password);

    if (permissionIds !== undefined) {
        const grants = [...new Set(permissionIds)];
        await assertCanGrant(req.user, grants);
        await assertPermissionsExist(grants);
        data.permissions = {
            deleteMany: {},
            create: grants.map((permissionId) => ({ permissionId })),
        };
    }

    const admin = await prisma.admin.update({ where: { id }, data, include: adminInclude });
    clearAuthCache(id, "admin"); // the new permissions apply immediately

    return res.status(200).json(new ApiResponse(200, toResponse(admin), "Admin updated successfully"));
});

const deleteAdmin = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);

    const existing = await prisma.admin.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Admin not found");
    if (existing.isSystem) {
        throw new ApiError(403, "The system Super Admin cannot be deleted");
    }
    if (existing.id === req.user.id) {
        throw new ApiError(400, "You cannot delete your own account");
    }

    await prisma.admin.delete({ where: { id } });
    clearAuthCache(id, "admin");

    return res.status(200).json(new ApiResponse(200, null, "Admin deleted successfully"));
});

export default { getAllAdmins, getAdminById, getNextId, createAdmin, updateAdmin, deleteAdmin };
