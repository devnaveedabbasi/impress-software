import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const isProvinceNameConflict = (error) => {
    const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");
    const message = String(error?.message || "");

    return (
        error?.code === "P2002" ||
        target.includes("name") ||
        message.includes("Province_name_key") ||
        message.includes("Unique constraint failed")
    );
};

const handleProvinceWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isProvinceNameConflict(error)) {
            throw new ApiError(409, "Province already exists.");
        }
        throw error;
    }
};

const createProvince = asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) {
        throw new ApiError(400, "Province name is required");
    }

    const provinceName = name.trim();

    console.log(
        `[Province] Creating "${provinceName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    const existingProvince = await prisma.province.findUnique({
        where: { name: provinceName },
    });

    if (existingProvince) {
        throw new ApiError(409, "Province already exists.");
    }

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Province"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Province"), 1),
            EXISTS(SELECT 1 FROM "Province")
        )
    `;

    const province = await handleProvinceWrite(() =>
        prisma.province.create({
            data: {
                name: provinceName,
                createdById: req.user?.id,
            },
        })
    );

    return res.status(201).json(
        new ApiResponse(201, province, "Province created successfully")
    );
});

const getAllProvinces = asyncHandler(async (req, res) => {
    const provinces = await prisma.province.findMany({
        orderBy: { id: "asc" },
    });
    return res.status(200).json(
        new ApiResponse(200, provinces, "Provinces fetched successfully")
    );
});

const getByIdProvince = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Province id is required");
    }
    const province = await prisma.province.findUnique({
        where: { id: Number(id) },
    });
    return res.status(200).json(
        new ApiResponse(200, province, "Province fetched successfully")
    );
});

const updateProvince = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;
    if (!id) {
        throw new ApiError(400, "Province id is required");
    }
    if (!name?.trim()) {
        throw new ApiError(400, "Province name is required");
    }

    const provinceName = name.trim();

    const existingProvince = await prisma.province.findFirst({
        where: {
            name: provinceName,
            NOT: { id: Number(id) },
        },
        select: { id: true },
    });

    if (existingProvince) {
        throw new ApiError(409, "Province already exists.");
    }

    const province = await handleProvinceWrite(() =>
        prisma.province.update({
            where: { id: Number(id) },
            data: {
                name: provinceName,
                updatedById: req.user?.id,
            },
        })
    );

    return res.status(200).json(
        new ApiResponse(200, province, "Province updated successfully")
    );
});

const deleteProvince = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Province id is required");
    }
    const province = await prisma.province.delete({
        where: { id: Number(id) },
    });
    return res.status(200).json(
        new ApiResponse(200, province, "Province deleted successfully")
    );
});

const getNextIdProvince = asyncHandler(async (req, res) => {
    const { _max } = await prisma.province.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Province] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Province ID fetched successfully")
    );
});

export default {
    createProvince,
    getAllProvinces,
    updateProvince,
    deleteProvince,
    getByIdProvince,
    getNextIdProvince,
};
