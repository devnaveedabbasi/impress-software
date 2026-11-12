import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { getStockInHand, replaceMovements, removeMovements, TX_OPTIONS } from "../services/stock.service.js";

// Transfer Form: the stock of old item(s) is moved to a new item (new code / new name).
// The id of the record is the Trans ID. "qty" is the total moved and always equals the total of the old rows.
const transferInclude = {
    newInventory: { select: { id: true, itemName: true } },
    items: {
        orderBy: { id: "asc" },
        include: { inventory: { select: { id: true, itemName: true } } },
    },
};

const syncSequence = (table) =>
    getActiveDatabaseClient().$executeRawUnsafe(`
        SELECT setval(
            pg_get_serial_sequence('"${table}"', 'id'),
            COALESCE((SELECT MAX(id) FROM "${table}"), 1),
            EXISTS(SELECT 1 FROM "${table}")
        )
    `);

const normalizeItems = (items) =>
    items.map((item) => ({
        inventoryId: Number(item.inventoryId),
        qty: Number(item.qty),
    }));

const totalOf = (items) => items.reduce((sum, item) => sum + item.qty, 0);

// Clear 400 instead of a foreign key error when an item does not exist
const assertItemsExist = async (ids) => {
    const unique = [...new Set(ids)];
    const found = await prisma.inventory.findMany({ where: { id: { in: unique } }, select: { id: true } });
    const foundIds = new Set(found.map((item) => item.id));
    const missing = unique.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
        throw new ApiError(400, `Inventory item(s) not found: ${missing.join(", ")}`);
    }
};

// An old item cannot give more than its stock in hand. When a transfer is edited, what it moved before goes
// back first (alreadyMoved), because the new quantity replaces the old one.
const assertEnoughStock = async (items, alreadyMoved = new Map()) => {
    const ids = items.map((item) => item.inventoryId);
    const [stock, inventories] = await Promise.all([
        getStockInHand(ids),
        prisma.inventory.findMany({ where: { id: { in: ids } }, select: { id: true, itemName: true } }),
    ]);
    const names = new Map(inventories.map((row) => [row.id, row.itemName]));

    const problems = [];
    items.forEach((item, index) => {
        const available = (stock.get(item.inventoryId) || 0) + (alreadyMoved.get(item.inventoryId) || 0);
        if (item.qty > available) {
            problems.push({
                field: `items.${index}.qty`,
                message: `${names.get(item.inventoryId) || "Item"}: Qty (${item.qty}) is more than the hand stock (${available})`,
            });
        }
    });
    if (problems.length > 0) {
        throw new ApiError(400, problems[0].message, problems);
    }
};

// Old items: stock out (-). New item: the total comes in (+)
const writeMovements = (tx, transfer, userId) =>
    replaceMovements(tx, {
        sourceType: "TRANSFER",
        sourceId: transfer.id,
        date: transfer.date,
        rows: [
            ...transfer.items.map((item) => ({ inventoryId: item.inventoryId, qty: -item.qty })),
            { inventoryId: transfer.newInventoryId, qty: transfer.qty },
        ],
        userId,
        note: `Transfer #${transfer.id}`,
    });

const getAllStockTransfers = asyncHandler(async (req, res) => {
    const transfers = await prisma.stockTransfer.findMany({
        include: transferInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, transfers, "Transfers fetched successfully"));
});

const getByIdStockTransfer = asyncHandler(async (req, res) => {
    const transfer = await prisma.stockTransfer.findUnique({
        where: { id: Number(req.params.id) },
        include: transferInclude,
    });
    if (!transfer) {
        throw new ApiError(404, "Transfer not found");
    }
    return res.status(200).json(new ApiResponse(200, transfer, "Transfer fetched successfully"));
});

const createStockTransfer = asyncHandler(async (req, res) => {
    const { date } = req.body;
    const newInventoryId = Number(req.body.newInventoryId);
    const items = normalizeItems(req.body.items);

    console.log(`[StockTransfer] Creating transfer in ${getActiveDatabaseName().toUpperCase()} database`);

    await assertItemsExist([newInventoryId, ...items.map((item) => item.inventoryId)]);
    await assertEnoughStock(items);

    await syncSequence("StockTransfer");
    await syncSequence("StockTransferItem");

    // The transfer and its stock movements are saved together, or not at all
    const transfer = await getActiveDatabaseClient().$transaction(async (tx) => {
        const created = await tx.stockTransfer.create({
            data: {
                date: new Date(date),
                newInventoryId,
                qty: totalOf(items),
                createdById: req.user?.id,
                items: { create: items },
            },
            include: transferInclude,
        });
        await writeMovements(tx, created, req.user?.id);
        return created;
    }, TX_OPTIONS);

    return res.status(201).json(new ApiResponse(201, transfer, "Transfer created successfully"));
});

const updateStockTransfer = asyncHandler(async (req, res) => {
    const transferId = Number(req.params.id);
    const newInventoryId = Number(req.body.newInventoryId);
    const items = normalizeItems(req.body.items);

    const existing = await prisma.stockTransfer.findUnique({ where: { id: transferId } });
    if (!existing) {
        throw new ApiError(404, "Transfer not found");
    }

    await assertItemsExist([newInventoryId, ...items.map((item) => item.inventoryId)]);
    const previous = await prisma.stockTransferItem.findMany({ where: { stockTransferId: transferId } });
    await assertEnoughStock(items, new Map(previous.map((row) => [row.inventoryId, row.qty])));
    await syncSequence("StockTransferItem");

    const transfer = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.stockTransfer.update({
            where: { id: transferId },
            data: {
                date: new Date(req.body.date),
                newInventoryId,
                qty: totalOf(items),
                updatedById: req.user?.id,
            },
        });

        // Rows that stay are updated, new rows are added, removed rows are deleted
        const existingItems = await tx.stockTransferItem.findMany({ where: { stockTransferId: transferId } });
        const existingByInventory = new Map(existingItems.map((row) => [row.inventoryId, row]));
        const keepIds = new Set(items.map((item) => item.inventoryId));

        const removedIds = existingItems.filter((row) => !keepIds.has(row.inventoryId)).map((row) => row.id);
        if (removedIds.length > 0) {
            await tx.stockTransferItem.deleteMany({ where: { id: { in: removedIds } } });
        }
        for (const item of items) {
            const current = existingByInventory.get(item.inventoryId);
            if (current) {
                await tx.stockTransferItem.update({ where: { id: current.id }, data: { qty: item.qty } });
            } else {
                await tx.stockTransferItem.create({ data: { ...item, stockTransferId: transferId } });
            }
        }

        const updated = await tx.stockTransfer.findUnique({ where: { id: transferId }, include: transferInclude });
        await writeMovements(tx, updated, req.user?.id);
        return updated;
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, transfer, "Transfer updated successfully"));
});

const deleteStockTransfer = asyncHandler(async (req, res) => {
    const transferId = Number(req.params.id);

    const existing = await prisma.stockTransfer.findUnique({ where: { id: transferId } });
    if (!existing) {
        throw new ApiError(404, "Transfer not found");
    }

    // The ledger lines are removed with it (the stock goes back). Item rows are removed automatically.
    await getActiveDatabaseClient().$transaction(async (tx) => {
        await removeMovements(tx, "TRANSFER", transferId);
        await tx.stockTransfer.delete({ where: { id: transferId } });
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, null, "Transfer deleted successfully"));
});

const getNextIdStockTransfer = asyncHandler(async (req, res) => {
    const { _max } = await prisma.stockTransfer.aggregate({ _max: { id: true } });
    const nextId = (_max.id || 0) + 1;

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(new ApiResponse(200, { nextId }, "Next Trans ID fetched successfully"));
});

export default {
    getAllStockTransfers,
    getByIdStockTransfer,
    createStockTransfer,
    updateStockTransfer,
    deleteStockTransfer,
    getNextIdStockTransfer,
};
