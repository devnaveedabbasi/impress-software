import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const isColorNameConflict = (error) => {
    const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");
    const message = String(error?.message || "");

    return (
        error?.code === "P2002" ||
        target.includes("name") ||
        message.includes("Color_name_key") ||
        message.includes("Unique constraint failed")
    );
};

const handleColorWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isColorNameConflict(error)) {
            throw new ApiError(409, "Color already exists.");
        }
        throw error;
    }
};

// Case-insensitive duplicate check, so "Red" and "red" cannot both exist
const findColorByName = (name, excludeId) =>
    prisma.color.findFirst({
        where: {
            name: { equals: name, mode: "insensitive" },
            ...(excludeId ? { NOT: { id: excludeId } } : {}),
        },
        select: { id: true },
    });

const getAllColors = asyncHandler(async (req, res) => {
    const colors = await prisma.color.findMany({
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, colors, "Colors fetched successfully"));
});

const getByIdColor = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const color = await prisma.color.findUnique({ where: { id: Number(id) } });

    if (!color) {
        throw new ApiError(404, "Color not found");
    }
    return res.status(200).json(new ApiResponse(200, color, "Color fetched successfully"));
});

const createColor = asyncHandler(async (req, res) => {
    const colorName = req.body.name?.trim();
    if (!colorName) {
        throw new ApiError(400, "Color name is required");
    }

    console.log(
        `[Color] Creating "${colorName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    if (await findColorByName(colorName)) {
        throw new ApiError(409, "Color already exists.");
    }

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Color"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Color"), 1),
            EXISTS(SELECT 1 FROM "Color")
        )
    `;

    const color = await handleColorWrite(() =>
        prisma.color.create({
            data: {
                name: colorName,
                createdById: req.user?.id,
            },
        })
    );

    return res.status(201).json(new ApiResponse(201, color, "Color created successfully"));
});

const updateColor = asyncHandler(async (req, res) => {
    const colorId = Number(req.params.id);
    const colorName = req.body.name?.trim();

    if (!colorName) {
        throw new ApiError(400, "Color name is required");
    }

    const existing = await prisma.color.findUnique({ where: { id: colorId } });
    if (!existing) {
        throw new ApiError(404, "Color not found");
    }

    if (await findColorByName(colorName, colorId)) {
        throw new ApiError(409, "Color already exists.");
    }

    const color = await handleColorWrite(() =>
        prisma.color.update({
            where: { id: colorId },
            data: {
                name: colorName,
                updatedById: req.user?.id,
            },
        })
    );

    return res.status(200).json(new ApiResponse(200, color, "Color updated successfully"));
});

const deleteColor = asyncHandler(async (req, res) => {
    const colorId = Number(req.params.id);

    const existing = await prisma.color.findUnique({ where: { id: colorId } });
    if (!existing) {
        throw new ApiError(404, "Color not found");
    }

    const usedInStock = await prisma.inventoryStock.count({ where: { colorId } });
    if (usedInStock > 0) {
        throw new ApiError(
            400,
            `This color is used in ${usedInStock} inventory stock row(s) and cannot be deleted`
        );
    }

    await prisma.color.delete({ where: { id: colorId } });

    return res.status(200).json(new ApiResponse(200, null, "Color deleted successfully"));
});

const getNextIdColor = asyncHandler(async (req, res) => {
    const { _max } = await prisma.color.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Color] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Color ID fetched successfully")
    );
});

export default {
    getAllColors,
    getByIdColor,
    createColor,
    updateColor,
    deleteColor,
    getNextIdColor,
};
