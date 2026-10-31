import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllDepartments = asyncHandler(async (req, res) => {
    const departments = await prisma.department.findMany();
    return res.status(200).json(new ApiResponse(200, departments, "Departments fetched successfully"));
});

const getByIdDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const department = await prisma.department.findUnique({ where: { id: Number(id) } });

    if (!department) {
        throw new ApiError(404, "Department not found");
    }
    return res.status(200).json(new ApiResponse(200, department, "Department fetched successfully"));
});

const createDepartment = asyncHandler(async (req, res) => {
    const { name } = req.body;
    
    const department = await prisma.department.create({
        data: {
            name,
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, department, "Department created successfully"));
});

const updateDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    const existingDepartment = await prisma.department.findUnique({ where: { id: Number(id) } });
    if (!existingDepartment) {
        throw new ApiError(404, "Department not found");
    }

    const department = await prisma.department.update({
        where: { id: Number(id) },
        data: {
            name: name !== undefined ? name : existingDepartment.name,
            updatedById: req.user?.id
        }
    });

    return res.status(200).json(new ApiResponse(200, department, "Department updated successfully"));
});

const deleteDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingDepartment = await prisma.department.findUnique({ where: { id: Number(id) } });
    if (!existingDepartment) {
        throw new ApiError(404, "Department not found");
    }

    await prisma.department.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Department deleted successfully"));
});

const getNextIdDepartment = asyncHandler(async (req, res) => {
    const lastDepartment = await prisma.department.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastDepartment ? lastDepartment.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Department ID fetched successfully"
        )
    );
});

export default {
    getAllDepartments,
    getByIdDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    getNextIdDepartment
};
