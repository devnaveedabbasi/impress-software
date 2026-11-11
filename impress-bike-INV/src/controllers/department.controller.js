import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const isDepartmentNameConflict = (error) => {
    const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");
    const message = String(error?.message || "");

    return (
        error?.code === "P2002" ||
        target.includes("name") ||
        message.includes("Department_name_key") ||
        message.includes("Unique constraint failed")
    );
};

const handleDepartmentWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isDepartmentNameConflict(error)) {
            throw new ApiError(409, "Department already exists.");
        }
        throw error;
    }
};

const getAllDepartments = asyncHandler(async (req, res) => {
    const departments = await prisma.department.findMany({
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, departments, "Departments fetched successfully"));
});

const getByIdDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Department id is required");
    }
    const department = await prisma.department.findUnique({ where: { id: Number(id) } });

    if (!department) {
        throw new ApiError(404, "Department not found");
    }
    return res.status(200).json(new ApiResponse(200, department, "Department fetched successfully"));
});

const createDepartment = asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) {
        throw new ApiError(400, "Department name is required");
    }

    const departmentName = name.trim();

    console.log(
        `[Department] Creating "${departmentName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    const existingDepartment = await prisma.department.findUnique({
        where: { name: departmentName },
    });

    if (existingDepartment) {
        throw new ApiError(409, "Department already exists.");
    }

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Department"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Department"), 1),
            EXISTS(SELECT 1 FROM "Department")
        )
    `;

    const department = await handleDepartmentWrite(() =>
        prisma.department.create({
            data: {
                name: departmentName,
                createdById: req.user?.id,
            },
        })
    );

    return res.status(201).json(new ApiResponse(201, department, "Department created successfully"));
});

const updateDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!id) {
        throw new ApiError(400, "Department id is required");
    }
    if (!name?.trim()) {
        throw new ApiError(400, "Department name is required");
    }

    const departmentName = name.trim();

    const existingDepartment = await prisma.department.findFirst({
        where: {
            name: departmentName,
            NOT: { id: Number(id) },
        },
        select: { id: true },
    });

    if (existingDepartment) {
        throw new ApiError(409, "Department already exists.");
    }

    const department = await handleDepartmentWrite(() =>
        prisma.department.update({
            where: { id: Number(id) },
            data: {
                name: departmentName,
                updatedById: req.user?.id,
            },
        })
    );

    return res.status(200).json(new ApiResponse(200, department, "Department updated successfully"));
});

const deleteDepartment = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Department id is required");
    }

    const usedInIssues = await prisma.storeIssue.count({ where: { departmentId: Number(id) } });
    const usedInReturns = await prisma.itemReturn.count({ where: { departmentId: Number(id) } });
    if (usedInIssues + usedInReturns > 0) {
        throw new ApiError(
            400,
            `This department is used in ${usedInIssues} Issue slip(s) and ${usedInReturns} Item Return slip(s) and cannot be deleted`
        );
    }

    await prisma.department.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Department deleted successfully"));
});

const getNextIdDepartment = asyncHandler(async (req, res) => {
    const { _max } = await prisma.department.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Department] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Department ID fetched successfully")
    );
});

export default {
    getAllDepartments,
    getByIdDepartment,
    createDepartment,
    updateDepartment,
    deleteDepartment,
    getNextIdDepartment,
};
