import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";

const isStationNameConflict = (error) => {
    const target = Array.isArray(error?.meta?.target)
        ? error.meta.target.join(",")
        : String(error?.meta?.target || "");
    const message = String(error?.message || "");

    return (
        error?.code === "P2002" ||
        target.includes("name") ||
        message.includes("Station_name_key") ||
        message.includes("Unique constraint failed")
    );
};

const handleStationWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isStationNameConflict(error)) {
            throw new ApiError(409, "Station already exists.");
        }
        throw error;
    }
};

const getAllStations = asyncHandler(async (req, res) => {
    const stations = await prisma.station.findMany({
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, stations, "Stations fetched successfully"));
});

const getByIdStation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Station id is required");
    }
    const station = await prisma.station.findUnique({ where: { id: Number(id) } });

    if (!station) {
        throw new ApiError(404, "Station not found");
    }
    return res.status(200).json(new ApiResponse(200, station, "Station fetched successfully"));
});

const createStation = asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name?.trim()) {
        throw new ApiError(400, "Station name is required");
    }

    const stationName = name.trim();

    console.log(
        `[Station] Creating "${stationName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    const existingStation = await prisma.station.findUnique({
        where: { name: stationName },
    });

    if (existingStation) {
        throw new ApiError(409, "Station already exists.");
    }

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Station"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Station"), 1),
            EXISTS(SELECT 1 FROM "Station")
        )
    `;

    const station = await handleStationWrite(() =>
        prisma.station.create({
            data: {
                name: stationName,
                createdById: req.user?.id,
            },
        })
    );

    return res.status(201).json(new ApiResponse(201, station, "Station created successfully"));
});

const updateStation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    if (!id) {
        throw new ApiError(400, "Station id is required");
    }
    if (!name?.trim()) {
        throw new ApiError(400, "Station name is required");
    }

    const stationName = name.trim();

    const existingStation = await prisma.station.findFirst({
        where: {
            name: stationName,
            NOT: { id: Number(id) },
        },
        select: { id: true },
    });

    if (existingStation) {
        throw new ApiError(409, "Station already exists.");
    }

    const station = await handleStationWrite(() =>
        prisma.station.update({
            where: { id: Number(id) },
            data: {
                name: stationName,
                updatedById: req.user?.id,
            },
        })
    );

    return res.status(200).json(new ApiResponse(200, station, "Station updated successfully"));
});

const deleteStation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Station id is required");
    }

    const usedInStock = await prisma.inventoryStock.count({ where: { stationId: Number(id) } });
    if (usedInStock > 0) {
        throw new ApiError(
            400,
            `This station is used in ${usedInStock} inventory stock row(s) and cannot be deleted`
        );
    }

    await prisma.station.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Station deleted successfully"));
});

const getNextIdStation = asyncHandler(async (req, res) => {
    const { _max } = await prisma.station.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Station] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Station ID fetched successfully")
    );
});

export default {
    getAllStations,
    getByIdStation,
    createStation,
    updateStation,
    deleteStation,
    getNextIdStation,
};
