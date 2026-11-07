import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const isCategoryNameConflict = (error) => {
    const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");
    const message = String(error?.message || "");

    return (
        error?.code === "P2002" ||
        target.includes("name") ||
        message.includes("Category_name_key") ||
        message.includes("Unique constraint failed")
    );
};

const handleCategoryWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isCategoryNameConflict(error)) {
            throw new ApiError(409, "Category already exists.");
        }
        throw error;
    }
};

const getAllCategories = asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany({
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, categories, "Categories fetched successfully"));
});

const getByIdCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Category id is required");
    }
    const category = await prisma.category.findUnique({ where: { id: Number(id) } });

    if (!category) {
        throw new ApiError(404, "Category not found");
    }
    return res.status(200).json(new ApiResponse(200, category, "Category fetched successfully"));
});

const createCategory = asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) {
        throw new ApiError(400, "Category name is required");
    }

    const categoryName = name.trim();

    console.log(
        `[Category] Creating "${categoryName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    const existingCategory = await prisma.category.findUnique({
        where: { name: categoryName },
    });

    if (existingCategory) {
        throw new ApiError(409, "Category already exists.");
    }

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Category"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Category"), 1),
            EXISTS(SELECT 1 FROM "Category")
        )
    `;

    const category = await handleCategoryWrite(() =>
        prisma.category.create({
            data: {
                name: categoryName,
                createdById: req.user?.id,
            },
        })
    );

    return res.status(201).json(new ApiResponse(201, category, "Category created successfully"));
});

const updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!id) {
        throw new ApiError(400, "Category id is required");
    }
    if (!name?.trim()) {
        throw new ApiError(400, "Category name is required");
    }

    const categoryName = name.trim();

    const existingCategory = await prisma.category.findFirst({
        where: {
            name: categoryName,
            NOT: { id: Number(id) },
        },
        select: { id: true },
    });

    if (existingCategory) {
        throw new ApiError(409, "Category already exists.");
    }

    const category = await handleCategoryWrite(() =>
        prisma.category.update({
            where: { id: Number(id) },
            data: {
                name: categoryName,
                updatedById: req.user?.id,
            },
        })
    );

    return res.status(200).json(new ApiResponse(200, category, "Category updated successfully"));
});

const deleteCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Category id is required");
    }

    await prisma.category.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Category deleted successfully"));
});

const getNextIdCategory = asyncHandler(async (req, res) => {
    const { _max } = await prisma.category.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Category] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Category ID fetched successfully")
    );
});

export default {
    getAllCategories,
    getByIdCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    getNextIdCategory,
};
