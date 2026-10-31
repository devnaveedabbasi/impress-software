import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const createProvince = asyncHandler(async (req, res) => {
    const { name } = req.body
    if (!name) {
        throw new ApiError(400, "Province name is required")
    }
    const province = await prisma.province.create({
        data: {
            name,
            createdById: req.user?.id
        }
    })
    return res.status(201).json(
        new ApiResponse(
            201,
            province,
            "Province created successfully"
        )
    )
})

const getAllProvinces = asyncHandler(async (req, res) => {
    const provinces = await prisma.province.findMany()
    return res.status(200).json(
        new ApiResponse(
            200,
            provinces,
            "Provinces fetched successfully"
        )
    )
})

const updateProvince = asyncHandler(async (req, res) => {
    const { id } = req.params
    const { name } = req.body
    if (!id) {
        throw new ApiError(400, "Province id is required")
    }
    const province = await prisma.province.update({
        where: {
            id: Number(id)
        },
        data: {
            name,
            updatedById: req.user?.id
        }
    })
    return res.status(200).json(
        new ApiResponse(
            200,
            province,
            "Province updated successfully"
        )
    )
})

const getByIdProvince = asyncHandler(async (req, res) => {
    const { id } = req.params
    if (!id) {
        throw new ApiError(400, "Province id is required")
    }
    const province = await prisma.province.findUnique({
        where: {
            id: Number(id)
        }
    })
    return res.status(200).json(
        new ApiResponse(
            200,
            province,
            "Province fetched successfully"
        )
    )
})

const deleteProvince = asyncHandler(async (req, res) => {
    const { id } = req.params
    if (!id) {
        throw new ApiError(400, "Province id is required")
    }
    const province = await prisma.province.delete({
        where: {
            id: Number(id)
        }
    })
    return res.status(200).json(
        new ApiResponse(
            200,
            province,
            "Province deleted successfully"
        )
    )
})
const getNextIdProvince = asyncHandler(async (req, res) => {
    const lastProvince = await prisma.province.findFirst({
        orderBy: { id: 'desc' }
    });
    
    const nextId = lastProvince ? lastProvince.id + 1 : 1;
    
    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Province ID fetched successfully"
        )
    );
});

export default {
    createProvince,
    getAllProvinces,
    updateProvince,
    deleteProvince,
    getByIdProvince,
    getNextIdProvince
}
