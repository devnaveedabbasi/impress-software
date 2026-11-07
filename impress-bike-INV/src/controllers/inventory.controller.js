import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const isInventoryConflict = (error) => {
    const message = String(error?.message || "");
    return (
        error?.code === "P2002" ||
        message.includes("Unique constraint failed")
    );
};

const handleInventoryWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isInventoryConflict(error)) {
            throw new ApiError(409, "Inventory item with this information already exists.");
        }
        throw error;
    }
};

const getAllInventories = asyncHandler(async (req, res) => {
    const inventories = await prisma.inventory.findMany({
        orderBy: { id: "asc" },
        include: {
            category: true,
            department: true,
        },
    });
    return res.status(200).json(new ApiResponse(200, inventories, "Inventories fetched successfully"));
});

const getByIdInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Inventory id is required");
    }
    const inventory = await prisma.inventory.findUnique({
        where: { id: Number(id) },
        include: {
            category: true,
            department: true,
        },
    });

    if (!inventory) {
        throw new ApiError(404, "Inventory not found");
    }
    return res.status(200).json(new ApiResponse(200, inventory, "Inventory fetched successfully"));
});

const createInventory = asyncHandler(async (req, res) => {
    const { itemName, categoryId, pack, rate, departmentId, stationIds, color, qty, unitPerBike } = req.body;

    if (!itemName?.trim() || !categoryId || !departmentId) {
        throw new ApiError(400, "Item name, category, and department are required");
    }

    const trimmedItemName = itemName.trim();

    console.log(
        `[Inventory] Creating "${trimmedItemName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Inventory"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Inventory"), 1),
            EXISTS(SELECT 1 FROM "Inventory")
        )
    `;

    const inventory = await handleInventoryWrite(() =>
        prisma.inventory.create({
            data: {
                itemName: trimmedItemName,
                categoryId: Number(categoryId),
                pack: Number(pack) || 0,
                rate: Number(rate) || 0,
                departmentId: Number(departmentId),
                stationIds: Array.isArray(stationIds) ? stationIds.map(Number) : [],
                color: Array.isArray(color) ? color : [],
                qty: Array.isArray(qty) ? qty.map(Number) : [],
                unitPerBike: Number(unitPerBike) || 0,
                createdById: req.user?.id,
            },
        })
    );

    return res.status(201).json(new ApiResponse(201, inventory, "Inventory created successfully"));
});

const updateInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { itemName, categoryId, pack, rate, departmentId, stationIds, color, qty, unitPerBike } = req.body;

    if (!id) {
        throw new ApiError(400, "Inventory id is required");
    }

    const existingInventory = await prisma.inventory.findUnique({ where: { id: Number(id) } });
    if (!existingInventory) {
        throw new ApiError(404, "Inventory not found");
    }

    const inventory = await handleInventoryWrite(() =>
        prisma.inventory.update({
            where: { id: Number(id) },
            data: {
                itemName: itemName !== undefined ? itemName.trim() : existingInventory.itemName,
                categoryId: categoryId !== undefined ? Number(categoryId) : existingInventory.categoryId,
                pack: pack !== undefined ? Number(pack) : existingInventory.pack,
                rate: rate !== undefined ? Number(rate) : existingInventory.rate,
                departmentId: departmentId !== undefined ? Number(departmentId) : existingInventory.departmentId,
                stationIds: stationIds !== undefined ? stationIds.map(Number) : existingInventory.stationIds,
                color: color !== undefined ? color : existingInventory.color,
                qty: qty !== undefined ? qty.map(Number) : existingInventory.qty,
                unitPerBike: unitPerBike !== undefined ? Number(unitPerBike) : existingInventory.unitPerBike,
                updatedById: req.user?.id,
            },
        })
    );

    return res.status(200).json(new ApiResponse(200, inventory, "Inventory updated successfully"));
});

const deleteInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Inventory id is required");
    }

    const existingInventory = await prisma.inventory.findUnique({ where: { id: Number(id) } });
    if (!existingInventory) {
        throw new ApiError(404, "Inventory not found");
    }

    await prisma.inventory.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Inventory deleted successfully"));
});

const getNextIdInventory = asyncHandler(async (req, res) => {
    const { _max } = await prisma.inventory.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Inventory] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Inventory ID fetched successfully")
    );
});

export default {
    getAllInventories,
    getByIdInventory,
    createInventory,
    updateInventory,
    deleteInventory,
    getNextIdInventory,
};
