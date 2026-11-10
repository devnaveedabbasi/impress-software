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

// Every inventory is returned with its stock rows and the linked Station / Color
const inventoryInclude = {
    category: true,
    department: true,
    stocks: {
        orderBy: { id: "asc" },
        include: {
            station: { select: { id: true, name: true } },
            color: { select: { id: true, name: true } },
        },
    },
};

const normalizeStocks = (stocks = []) =>
    stocks.map((row) => ({
        stationId: Number(row.stationId),
        colorId: Number(row.colorId),
        qty: Number(row.qty) || 0,
    }));

// Return a clear 400 instead of a foreign key error when a station / color does not exist
const assertStockLinksExist = async (stocks) => {
    const stationIds = [...new Set(stocks.map((row) => row.stationId))];
    const colorIds = [...new Set(stocks.map((row) => row.colorId))];
    const [stations, colors] = await Promise.all([
        prisma.station.findMany({ where: { id: { in: stationIds } }, select: { id: true } }),
        prisma.color.findMany({ where: { id: { in: colorIds } }, select: { id: true } }),
    ]);
    const missingStations = stationIds.filter((id) => !stations.some((s) => s.id === id));
    const missingColors = colorIds.filter((id) => !colors.some((c) => c.id === id));
    if (missingStations.length > 0) {
        throw new ApiError(400, `Station(s) not found: ${missingStations.join(", ")}`);
    }
    if (missingColors.length > 0) {
        throw new ApiError(400, `Color(s) not found: ${missingColors.join(", ")}`);
    }
};

const syncSequence = (table) =>
    getActiveDatabaseClient().$executeRawUnsafe(`
        SELECT setval(
            pg_get_serial_sequence('"${table}"', 'id'),
            COALESCE((SELECT MAX(id) FROM "${table}"), 1),
            EXISTS(SELECT 1 FROM "${table}")
        )
    `);

const getAllInventories = asyncHandler(async (req, res) => {
    const inventories = await prisma.inventory.findMany({
        orderBy: { id: "asc" },
        include: inventoryInclude,
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
        include: inventoryInclude,
    });

    if (!inventory) {
        throw new ApiError(404, "Inventory not found");
    }
    return res.status(200).json(new ApiResponse(200, inventory, "Inventory fetched successfully"));
});

const createInventory = asyncHandler(async (req, res) => {
    const { itemName, categoryId, pack, rate, departmentId, unitPerBike } = req.body;

    if (!itemName?.trim() || !categoryId || !departmentId) {
        throw new ApiError(400, "Item name, category, and department are required");
    }

    const trimmedItemName = itemName.trim();
    const stocks = normalizeStocks(req.body.stocks);

    console.log(
        `[Inventory] Creating "${trimmedItemName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertStockLinksExist(stocks);

    // Sync PostgreSQL auto-increment sequences
    await syncSequence("Inventory");
    await syncSequence("InventoryStock");

    const inventory = await handleInventoryWrite(() =>
        prisma.inventory.create({
            data: {
                itemName: trimmedItemName,
                categoryId: Number(categoryId),
                pack: Number(pack) || 0,
                rate: Number(rate) || 0,
                departmentId: Number(departmentId),
                unitPerBike: Number(unitPerBike) || 0,
                createdById: req.user?.id,
                stocks: { create: stocks },
            },
            include: inventoryInclude,
        })
    );

    return res.status(201).json(new ApiResponse(201, inventory, "Inventory created successfully"));
});

const updateInventory = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { itemName, categoryId, pack, rate, departmentId, unitPerBike } = req.body;

    if (!id) {
        throw new ApiError(400, "Inventory id is required");
    }
    const inventoryId = Number(id);

    const existingInventory = await prisma.inventory.findUnique({ where: { id: inventoryId } });
    if (!existingInventory) {
        throw new ApiError(404, "Inventory not found");
    }

    const stocks = req.body.stocks !== undefined ? normalizeStocks(req.body.stocks) : null;
    if (stocks) {
        await assertStockLinksExist(stocks);
        await syncSequence("InventoryStock");
    }

    const inventory = await handleInventoryWrite(() =>
        getActiveDatabaseClient().$transaction(async (tx) => {
            await tx.inventory.update({
                where: { id: inventoryId },
                data: {
                    itemName: itemName !== undefined ? itemName.trim() : existingInventory.itemName,
                    categoryId: categoryId !== undefined ? Number(categoryId) : existingInventory.categoryId,
                    pack: pack !== undefined ? Number(pack) : existingInventory.pack,
                    rate: rate !== undefined ? Number(rate) : existingInventory.rate,
                    departmentId: departmentId !== undefined ? Number(departmentId) : existingInventory.departmentId,
                    unitPerBike: unitPerBike !== undefined ? Number(unitPerBike) : existingInventory.unitPerBike,
                    updatedById: req.user?.id,
                },
            });

            if (stocks) {
                // Update rows that stay (same station + color), create new ones, delete removed ones
                const existingRows = await tx.inventoryStock.findMany({ where: { inventoryId } });
                const keyOf = (row) => `${row.stationId}:${row.colorId}`;
                const existingByKey = new Map(existingRows.map((row) => [keyOf(row), row]));
                const keepKeys = new Set(stocks.map(keyOf));

                const removedIds = existingRows.filter((row) => !keepKeys.has(keyOf(row))).map((row) => row.id);
                if (removedIds.length > 0) {
                    await tx.inventoryStock.deleteMany({ where: { id: { in: removedIds } } });
                }

                for (const row of stocks) {
                    const existing = existingByKey.get(keyOf(row));
                    if (existing) {
                        if (existing.qty !== row.qty) {
                            await tx.inventoryStock.update({ where: { id: existing.id }, data: { qty: row.qty } });
                        }
                    } else {
                        await tx.inventoryStock.create({ data: { ...row, inventoryId } });
                    }
                }
            }

            return tx.inventory.findUnique({ where: { id: inventoryId }, include: inventoryInclude });
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

    const usedInInwards = await prisma.inwardItem.count({ where: { inventoryId: Number(id) } });
    if (usedInInwards > 0) {
        throw new ApiError(
            400,
            `This item is used in ${usedInInwards} Inward/Quality Control record(s) and cannot be deleted`
        );
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
