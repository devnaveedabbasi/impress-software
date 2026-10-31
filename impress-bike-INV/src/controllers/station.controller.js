import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllStations = asyncHandler(async (req, res) => {
    const stations = await prisma.station.findMany();
    return res.status(200).json(new ApiResponse(200, stations, "Stations fetched successfully"));
});

const getByIdStation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const station = await prisma.station.findUnique({ where: { id: Number(id) } });

    if (!station) {
        throw new ApiError(404, "Station not found");
    }
    return res.status(200).json(new ApiResponse(200, station, "Station fetched successfully"));
});

const createStation = asyncHandler(async (req, res) => {
    const { name } = req.body;
    
    const station = await prisma.station.create({
        data: {
            name,
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, station, "Station created successfully"));
});

const updateStation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { name } = req.body;

    const existingStation = await prisma.station.findUnique({ where: { id: Number(id) } });
    if (!existingStation) {
        throw new ApiError(404, "Station not found");
    }

    const station = await prisma.station.update({
        where: { id: Number(id) },
        data: {
            name: name !== undefined ? name : existingStation.name,
            updatedById: req.user?.id
        }
    });

    return res.status(200).json(new ApiResponse(200, station, "Station updated successfully"));
});

const deleteStation = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingStation = await prisma.station.findUnique({ where: { id: Number(id) } });
    if (!existingStation) {
        throw new ApiError(404, "Station not found");
    }

    await prisma.station.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Station deleted successfully"));
});

const getNextIdStation = asyncHandler(async (req, res) => {
    const lastStation = await prisma.station.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastStation ? lastStation.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Station ID fetched successfully"
        )
    );
});

export default {
    getAllStations,
    getByIdStation,
    createStation,
    updateStation,
    deleteStation,
    getNextIdStation
};
