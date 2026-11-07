import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const isCityNameConflict = (error) => {
    const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");
    const message = String(error?.message || "");

    return (
        error?.code === "P2002" ||
        target.includes("name") ||
        message.includes("City_name_key") ||
        message.includes("Unique constraint failed")
    );
};

const handleCityWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isCityNameConflict(error)) {
            throw new ApiError(409, "City already exists.");
        }
        throw error;
    }
};

const createCity = asyncHandler(async (req, res) => {
    const { name, provinceId } = req.body;

    if (!name?.trim() || !provinceId) {
        throw new ApiError(400, "Name and provinceId are required");
    }
    console.log(
        `[City] Creating "${name.trim()}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    const cityName = name.trim();

    // Check existing city
    const existingCity = await prisma.city.findUnique({
        where: { name: cityName },
    });

    if (existingCity) {
        throw new ApiError(409, "City already exists.");
    }

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"City"', 'id'),
            COALESCE((SELECT MAX(id) FROM "City"), 1),
            EXISTS(SELECT 1 FROM "City")
        )
    `;

    const city = await handleCityWrite(() => prisma.city.create({
        data: {
            name: cityName,
            provinceId: Number(provinceId),
            createdById: req.user?.id,
        },
    }));

    return res.status(201).json(
        new ApiResponse(201, city, "City created successfully")
    );
});

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
    const existingCity = await prisma.city.findFirst({
        where: {
            name,
            NOT: { id: Number(id) },
        },
        select: { id: true },
    });
    if (existingCity) {
        throw new ApiError(409, "City already exists.");
    }

    const city = await handleCityWrite(
        () => prisma.city.update({
            where: {
                id: Number(id)
            },
            data: {
                name,
                ...(provinceId && { provinceId: Number(provinceId) }),
                updatedById: req.user?.id
            }
        })
    );
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
    const { _max } = await prisma.city.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[City] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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