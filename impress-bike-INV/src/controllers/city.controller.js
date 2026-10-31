import prisma from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const createCity = asyncHandler(async (req, res) => {
    const { name, provinceId } = req.body
    if (!name || !provinceId) {
        throw new ApiError(400, "Name and provinceId are required")
    }
    const city = await prisma.city.create({
        data: {
            name,
            provinceId: Number(provinceId),
            createdById: req.user?.id
        }
    })
    return res.status(201).json(
        new ApiResponse(
            201,
            city,
            "City created successfully"
        )
    )
})

const getAllCities = asyncHandler(async (req, res) => {
    const cities = await prisma.city.findMany()
    return res.status(200).json(
        new ApiResponse(
            200,
            cities,
            "Cities fetched successfully"
        )
    )
})

const getByIdCity = asyncHandler(async (req, res) => {
    const { id } = req.params
    if (!id) {
        throw new ApiError(400, "City id is required")
    }
    const city = await prisma.city.findUnique({
        where: {
            id: Number(id)
        }
    })
    return res.status(200).json(
        new ApiResponse(
            200,
            city,
            "City fetched successfully"
        )
    )
})

const updateCity = asyncHandler(async (req, res) => {
    const { id } = req.params
    const { name, provinceId } = req.body
    if (!id) {
        throw new ApiError(400, "City id is required")
    }
    const city = await prisma.city.update({
        where: {
            id: Number(id)
        },
        data: {
            name,
            ...(provinceId && { provinceId: Number(provinceId) }),
            updatedById: req.user?.id
        }
    })
    return res.status(200).json(
        new ApiResponse(
            200,
            city,
            "City updated successfully"
        )
    )
})

const deleteCity = asyncHandler(async (req, res) => {
    const { id } = req.params
    if (!id) {
        throw new ApiError(400, "City id is required")
    }
    const city = await prisma.city.delete({
        where: {
            id: Number(id)
        }
    })
    return res.status(200).json(
        new ApiResponse(
            200,
            city,
            "City deleted successfully"
        )
    )
})

const getByProvinceId = asyncHandler(async (req, res) => {
    const { provinceId } = req.params
    if (!provinceId) {
        throw new ApiError(400, "Province id is required")
    }
    const cities = await prisma.city.findMany({
        where: {
            provinceId: Number(provinceId)
        },
    })
    const resData = cities.map(city => {
        return {
            city: {
                id: city?.id,
                name: city?.name,
                provinceId: city?.provinceId,
            },
            province: {
                id: city?.province?.id,
                name: city?.province?.name,
            }
        }
    })
    return res.status(200).json(
        new ApiResponse(
            200,
            cities,
            "Cities fetched successfully"
        )
    )
})


const getNextIdCity = asyncHandler(async (req, res) => {
    const lastCity = await prisma.city.findFirst({
        orderBy: { id: 'desc' }
    });
    
    const nextId = lastCity ? lastCity.id + 1 : 1;
    
    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next City ID fetched successfully"
        )
    );
});

export default {
    createCity,
    getAllCities,
    getByIdCity,
    updateCity,
    deleteCity,
    getByProvinceId,
    getNextIdCity
}