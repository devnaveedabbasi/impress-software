import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { replaceMovements, removeMovements, TX_OPTIONS } from "../services/stock.service.js";

// The id of the record is the Requisition Slip No. Every slip is returned with its department and item rows.
const returnInclude = {
    department: { select: { id: true, name: true } },
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

// Return a clear 400 instead of a foreign key error when the department / an item does not exist
const assertLinksExist = async ({ departmentId, items }) => {
    if (departmentId !== undefined) {
        const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
        if (!department) throw new ApiError(400, "Department not found");
    }
    if (items) {
        const ids = [...new Set(items.map((item) => item.inventoryId))];
        const found = await prisma.inventory.findMany({ where: { id: { in: ids } }, select: { id: true } });
        const foundIds = new Set(found.map((item) => item.id));
        const missing = ids.filter((id) => !foundIds.has(id));
        if (missing.length > 0) {
            throw new ApiError(400, `Inventory item(s) not found: ${missing.join(", ")}`);
        }
    }
};

const normalizeItems = (items) =>
    items.map((item) => ({
        inventoryId: Number(item.inventoryId),
        recvdQty: Number(item.recvdQty),
        purpose: item.purpose || "",
    }));

// The returned parts come back to the store: one positive ledger line per item
const writeMovements = (tx, itemReturn, userId) =>
    replaceMovements(tx, {
        sourceType: "ITEM_RETURN",
        sourceId: itemReturn.id,
        date: itemReturn.date,
        rows: itemReturn.items.map((item) => ({ inventoryId: item.inventoryId, qty: item.recvdQty })),
        userId,
        note: `Item Return #${itemReturn.id}`,
    });

// A department cannot give back more than it was issued (and has not returned yet). This only warns, because
// parts that went to the department before this system started have no Issue slip.
const computeReturnWarnings = async ({ departmentId, items, excludeReturnId }) => {
    const ids = [...new Set(items.map((item) => item.inventoryId))];
    const [issued, returned, inventories] = await Promise.all([
        prisma.storeIssueItem.groupBy({
            by: ["inventoryId"],
            where: { inventoryId: { in: ids }, storeIssue: { departmentId } },
            _sum: { issueQty: true },
        }),
        prisma.itemReturnItem.groupBy({
            by: ["inventoryId"],
            where: {
                inventoryId: { in: ids },
                itemReturn: { departmentId, ...(excludeReturnId ? { NOT: { id: excludeReturnId } } : {}) },
            },
            _sum: { recvdQty: true },
        }),
        prisma.inventory.findMany({ where: { id: { in: ids } }, select: { id: true, itemName: true } }),
    ]);

    const issuedBy = new Map(issued.map((row) => [row.inventoryId, row._sum.issueQty || 0]));
    const returnedBy = new Map(returned.map((row) => [row.inventoryId, row._sum.recvdQty || 0]));
    const names = new Map(inventories.map((row) => [row.id, row.itemName]));

    const warnings = [];
    for (const item of items) {
        const left = Math.max((issuedBy.get(item.inventoryId) || 0) - (returnedBy.get(item.inventoryId) || 0), 0);
        if (item.recvdQty > left) {
            warnings.push(
                `${names.get(item.inventoryId) || `Item #${item.inventoryId}`}: ${item.recvdQty} received but only ${left} was issued to this department and not yet returned`
            );
        }
    }
    return warnings;
};

const getAllItemReturns = asyncHandler(async (req, res) => {
    const returns = await prisma.itemReturn.findMany({
        include: returnInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, returns, "Item returns fetched successfully"));
});

const getByIdItemReturn = asyncHandler(async (req, res) => {
    const itemReturn = await prisma.itemReturn.findUnique({
        where: { id: Number(req.params.id) },
        include: returnInclude,
    });

    if (!itemReturn) {
        throw new ApiError(404, "Item return not found");
    }
    return res.status(200).json(new ApiResponse(200, itemReturn, "Item return fetched successfully"));
});

const createItemReturn = asyncHandler(async (req, res) => {
    const { date } = req.body;
    const departmentId = Number(req.body.departmentId);
    const items = normalizeItems(req.body.items);

    console.log(
        `[ItemReturn] Creating return from department ${departmentId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertLinksExist({ departmentId, items });
    const warnings = await computeReturnWarnings({ departmentId, items });

    // Sync PostgreSQL auto-increment sequences
    await syncSequence("ItemReturn");
    await syncSequence("ItemReturnItem");

    // The slip and its stock movements are saved together, or not at all
    const itemReturn = await getActiveDatabaseClient().$transaction(async (tx) => {
        const created = await tx.itemReturn.create({
            data: {
                date: new Date(date),
                departmentId,
                createdById: req.user?.id,
                items: { create: items },
            },
            include: returnInclude,
        });
        await writeMovements(tx, created, req.user?.id);
        return created;
    }, TX_OPTIONS);

    return res.status(201).json({ ...new ApiResponse(201, itemReturn, "Item return created successfully"), warnings });
});

const updateItemReturn = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);
    const body = req.body;

    const existing = await prisma.itemReturn.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Item return not found");
    }

    const data = { updatedById: req.user?.id };
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.departmentId !== undefined) data.departmentId = Number(body.departmentId);

    const items = body.items !== undefined ? normalizeItems(body.items) : null;
    await assertLinksExist({ departmentId: data.departmentId, items });
    if (items) await syncSequence("ItemReturnItem");

    const warnings = items
        ? await computeReturnWarnings({
              departmentId: data.departmentId ?? existing.departmentId,
              items,
              excludeReturnId: returnId,
          })
        : [];

    const itemReturn = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.itemReturn.update({ where: { id: returnId }, data });

        if (items) {
            // Rows that stay are updated, new rows are added, removed rows are deleted
            const existingItems = await tx.itemReturnItem.findMany({ where: { itemReturnId: returnId } });
            const existingByInventory = new Map(existingItems.map((row) => [row.inventoryId, row]));
            const keepIds = new Set(items.map((item) => item.inventoryId));

            const removedIds = existingItems.filter((row) => !keepIds.has(row.inventoryId)).map((row) => row.id);
            if (removedIds.length > 0) {
                await tx.itemReturnItem.deleteMany({ where: { id: { in: removedIds } } });
            }

            for (const item of items) {
                const current = existingByInventory.get(item.inventoryId);
                if (current) {
                    await tx.itemReturnItem.update({
                        where: { id: current.id },
                        data: { recvdQty: item.recvdQty, purpose: item.purpose },
                    });
                } else {
                    await tx.itemReturnItem.create({ data: { ...item, itemReturnId: returnId } });
                }
            }
        }

        const updated = await tx.itemReturn.findUnique({ where: { id: returnId }, include: returnInclude });
        await writeMovements(tx, updated, req.user?.id);
        return updated;
    }, TX_OPTIONS);

    return res.status(200).json({ ...new ApiResponse(200, itemReturn, "Item return updated successfully"), warnings });
});

const deleteItemReturn = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);

    const existing = await prisma.itemReturn.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Item return not found");
    }

    // The ledger lines of the slip are removed with it. Item rows are removed automatically (onDelete: Cascade)
    await getActiveDatabaseClient().$transaction(async (tx) => {
        await removeMovements(tx, "ITEM_RETURN", returnId);
        await tx.itemReturn.delete({ where: { id: returnId } });
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, null, "Item return deleted successfully"));
});

const getNextIdItemReturn = asyncHandler(async (req, res) => {
    const { _max } = await prisma.itemReturn.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[ItemReturn] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Requisition Slip No fetched successfully")
    );
});

export default {
    getAllItemReturns,
    getByIdItemReturn,
    createItemReturn,
    updateItemReturn,
    deleteItemReturn,
    getNextIdItemReturn
};
