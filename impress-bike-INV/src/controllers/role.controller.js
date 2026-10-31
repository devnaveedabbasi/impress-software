import prisma from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";

// Helper function to normalize strings (removes spaces, hyphens, and converts to lowercase)
const normalizeString = (str) => {
    return str.replace(/[^a-zA-Z0-9]/g, "").toLowerCase();
};

// CREATE ROLE
const createRole = asyncHandler(async (req, res) => {
    const { name, permissionIds } = req.body;

    if (!name || name.trim() === "") {
        return res.status(400).json({ success: false, message: "Role name is required" });
    }

    const normalizedInputName = normalizeString(name);

    // Fetch all roles to do a robust comparison (since roles are few, this is efficient)
    const existingRoles = await prisma.role.findMany();

    const isDuplicate = existingRoles.some(
        (role) => normalizeString(role.name) === normalizedInputName
    );

    if (isDuplicate) {
        return res.status(400).json({ success: false, message: "Role already exists with a similar name" });
    }

    const role = await prisma.role.create({ 
        data: { 
            name: name.trim(),
            permissions: permissionIds && permissionIds.length > 0 ? {
                create: permissionIds.map(id => ({
                    permission: { connect: { id: parseInt(id) } }
                }))
            } : undefined
        },
        include: {
            permissions: {
                include: {
                    permission: true
                }
            }
        }
    });
    return res.status(201).json({ success: true, message: "Role created successfully", data: role });
});

// GET ALL ROLES
const getRoles = asyncHandler(async (req, res) => {
    const roles = await prisma.role.findMany({
        where: {
            name: {
                not: "admin"
            }
        },
        orderBy: { createdAt: 'desc' },
        include: {
            permissions: {
                include: {
                    permission: true
                }
            }
        }
    });
    return res.status(200).json({ success: true, data: roles });
});

// GET ROLE BY ID
const getRoleById = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const role = await prisma.role.findUnique({
        where: { id: parseInt(id) },
        include: {
            permissions: {
                include: {
                    permission: true
                }
            }
        }
    });

    if (!role) {
        return res.status(404).json({ success: false, message: "Role not found" });
    }

    return res.status(200).json({ success: true, data: role });
});

// UPDATE ROLE
const updateRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name, permissionIds } = req.body;

    if (!name || name.trim() === "") {
        return res.status(400).json({ success: false, message: "Role name is required" });
    }

    const roleId = parseInt(id);

    const existingRole = await prisma.role.findUnique({
        where: { id: roleId }
    });

    if (!existingRole) {
        return res.status(404).json({ success: false, message: "Role not found" });
    }

    const normalizedInputName = normalizeString(name);
    const allRoles = await prisma.role.findMany();

    const isDuplicate = allRoles.some(
        (role) => role.id !== roleId && normalizeString(role.name) === normalizedInputName
    );

    if (isDuplicate) {
        return res.status(400).json({ success: false, message: "Another role already exists with a similar name" });
    }

    const updateData = { name: name.trim() };
    if (permissionIds && Array.isArray(permissionIds)) {
        updateData.permissions = {
            deleteMany: {},
            create: permissionIds.map(id => ({
                permission: { connect: { id: parseInt(id) } }
            }))
        };
    }

    const updatedRole = await prisma.role.update({
        where: { id: roleId },
        data: updateData,
        include: {
            permissions: {
                include: {
                    permission: true
                }
            }
        }
    });

    return res.status(200).json({ success: true, message: "Role updated successfully", data: updatedRole });
});

// DELETE ROLE
const deleteRole = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const roleId = parseInt(id);

    const role = await prisma.role.findUnique({
        where: { id: roleId }
    });

    if (!role) {
        return res.status(404).json({ success: false, message: "Role not found" });
    }

    await prisma.role.delete({
        where: { id: roleId }
    });

    return res.status(200).json({ success: true, message: "Role deleted successfully" });
});

// GET NEXT ID
const getNextId = asyncHandler(async (req, res) => {
    const lastRole = await prisma.role.findFirst({
        orderBy: { id: 'desc' }
    });
    const nextId = lastRole ? lastRole.id + 1 : 1;
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Role ID fetched successfully")
    );
});

export default { createRole, getRoles, getRoleById, updateRole, deleteRole, getNextId };