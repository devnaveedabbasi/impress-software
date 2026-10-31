import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllCategories = asyncHandler(async (req, res) => {
    const categories = await prisma.category.findMany();
    return res.status(200).json(new ApiResponse(200, categories, "Categories fetched successfully"));
});

const getByIdCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const category = await prisma.category.findUnique({ where: { id: Number(id) } });

    if (!category) {
        throw new ApiError(404, "Category not found");
    }
    return res.status(200).json(new ApiResponse(200, category, "Category fetched successfully"));
});

const createCategory = asyncHandler(async (req, res) => {
    const { name } = req.body;
    
    const category = await prisma.category.create({
        data: {
            name,
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, category, "Category created successfully"));
});

const updateCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    const existingCategory = await prisma.category.findUnique({ where: { id: Number(id) } });
    if (!existingCategory) {
        throw new ApiError(404, "Category not found");
    }

    const category = await prisma.category.update({
        where: { id: Number(id) },
        data: {
            name: name !== undefined ? name : existingCategory.name,
            updatedById: req.user?.id
        }
    });

    return res.status(200).json(new ApiResponse(200, category, "Category updated successfully"));
});

const deleteCategory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingCategory = await prisma.category.findUnique({ where: { id: Number(id) } });
    if (!existingCategory) {
        throw new ApiError(404, "Category not found");
    }

    await prisma.category.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Category deleted successfully"));
});

const getNextIdCategory = asyncHandler(async (req, res) => {
    const lastCategory = await prisma.category.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastCategory ? lastCategory.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Category ID fetched successfully"
        )
    );
});

export default {
    getAllCategories,
    getByIdCategory,
    createCategory,
    updateCategory,
    deleteCategory,
    getNextIdCategory
};
