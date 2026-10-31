import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllInventories = asyncHandler(async (req, res) => {
    const inventories = await prisma.inventory.findMany({
        include: {
            category: true,
            department: true
        }
    });
    return res.status(200).json(new ApiResponse(200, inventories, "Inventories fetched successfully"));
});

const getByIdInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const inventory = await prisma.inventory.findUnique({
        where: { id: Number(id) },
        include: {
            category: true,
            department: true
        }
    });

    if (!inventory) {
        throw new ApiError(404, "Inventory not found");
    }
    return res.status(200).json(new ApiResponse(200, inventory, "Inventory fetched successfully"));
});

const createInventory = asyncHandler(async (req, res) => {
    const { itemName, categoryId, pack, rate, departmentId, stationIds, color, qty, unitPerBike } = req.body;

    const inventory = await prisma.inventory.create({
        data: {
            itemName,
            categoryId: Number(categoryId),
            pack: Number(pack),
            rate: Number(rate),
            departmentId: Number(departmentId),
            stationIds: stationIds.map(id => Number(id)),
            color,
            qty: qty.map(Number),
            unitPerBike: Number(unitPerBike),
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, inventory, "Inventory created successfully"));
});

const updateInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { itemName, categoryId, pack, rate, departmentId, stationIds, color, qty, unitPerBike } = req.body;

    const existingInventory = await prisma.inventory.findUnique({ where: { id: Number(id) } });
    if (!existingInventory) {
        throw new ApiError(404, "Inventory not found");
    }

    const inventory = await prisma.inventory.update({
        where: { id: Number(id) },
        data: {
            itemName: itemName !== undefined ? itemName : existingInventory.itemName,
            categoryId: categoryId !== undefined ? Number(categoryId) : existingInventory.categoryId,
            pack: pack !== undefined ? Number(pack) : existingInventory.pack,
            rate: rate !== undefined ? Number(rate) : existingInventory.rate,
            departmentId: departmentId !== undefined ? Number(departmentId) : existingInventory.departmentId,
            stationIds: stationIds !== undefined ? stationIds.map(id => Number(id)) : existingInventory.stationIds,
            color: color !== undefined ? color : existingInventory.color,
            qty: qty !== undefined ? qty.map(Number) : existingInventory.qty,
            unitPerBike: unitPerBike !== undefined ? Number(unitPerBike) : existingInventory.unitPerBike,
            updatedById: req.user?.id
        }
    });

    return res.status(200).json(new ApiResponse(200, inventory, "Inventory updated successfully"));
});

const deleteInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingInventory = await prisma.inventory.findUnique({ where: { id: Number(id) } });
    if (!existingInventory) {
        throw new ApiError(404, "Inventory not found");
    }

    await prisma.inventory.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Inventory deleted successfully"));
});

const getNextIdInventory = asyncHandler(async (req, res) => {
    const lastInventory = await prisma.inventory.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastInventory ? lastInventory.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Inventory ID fetched successfully"
        )
    );
});

export default {
    getAllInventories,
    getByIdInventory,
    createInventory,
    updateInventory,
    deleteInventory,
    getNextIdInventory
};
