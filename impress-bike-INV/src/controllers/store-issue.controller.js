import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { getStockInHand, replaceMovements, removeMovements, TX_OPTIONS } from "../services/stock.service.js";

// The id of the record is the Requisition Slip No. Every slip is returned with its department, color and item rows.
const issueInclude = {
    department: { select: { id: true, name: true } },
    color: { select: { id: true, name: true } },
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

// Return a clear 400 instead of a foreign key error when the department / color / an item does not exist
const assertLinksExist = async ({ departmentId, colorId, items }) => {
    if (departmentId !== undefined) {
        const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { id: true } });
        if (!department) throw new ApiError(400, "Department not found");
    }
    if (colorId !== undefined) {
        const color = await prisma.color.findUnique({ where: { id: colorId }, select: { id: true } });
        if (!color) throw new ApiError(400, "Color not found");
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

// Upm (units per bike) and Hand Stock are read by the server, the client cannot choose them.
// Hand stock comes from the stock ledger (inventory master + movements).
const readItemFacts = async (inventoryIds) => {
    const [inventories, handStock] = await Promise.all([
        prisma.inventory.findMany({ where: { id: { in: inventoryIds } }, select: { id: true, itemName: true, unitPerBike: true } }),
        getStockInHand(inventoryIds),
    ]);
    const upm = new Map(inventories.map((row) => [row.id, row.unitPerBike || 0]));
    const names = new Map(inventories.map((row) => [row.id, row.itemName]));
    return { upm, handStock, names };
};

// An item cannot be issued for more than the stock in hand. When a slip is edited, what it issued before
// goes back first (alreadyIssued), because the new quantity replaces the old one.
const assertEnoughStock = (items, facts, alreadyIssued = new Map()) => {
    const problems = [];
    items.forEach((item, index) => {
        const available = (facts.handStock.get(item.inventoryId) || 0) + (alreadyIssued.get(item.inventoryId) || 0);
        if (item.issueQty > available) {
            problems.push({
                field: `items.${index}.issueQty`,
                message: `${facts.names.get(item.inventoryId) || "Item"}: Issue Qty (${item.issueQty}) is more than the hand stock (${available})`,
            });
        }
    });
    if (problems.length > 0) {
        throw new ApiError(400, problems[0].message, problems);
    }
};

const normalizeItems = (items) =>
    items.map((item) => ({
        inventoryId: Number(item.inventoryId),
        issueQty: Number(item.issueQty),
        purpose: item.purpose || "",
    }));

// The issued parts leave the store: one negative ledger line per item
const writeMovements = (tx, issue, userId) =>
    replaceMovements(tx, {
        sourceType: "STORE_ISSUE",
        sourceId: issue.id,
        date: issue.date,
        rows: issue.items.map((item) => ({ inventoryId: item.inventoryId, qty: -item.issueQty })),
        userId,
        note: `Store Issuance #${issue.id}`,
    });

const getAllStoreIssues = asyncHandler(async (req, res) => {
    const issues = await prisma.storeIssue.findMany({
        include: issueInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, issues, "Store issues fetched successfully"));
});

const getByIdStoreIssue = asyncHandler(async (req, res) => {
    const issue = await prisma.storeIssue.findUnique({
        where: { id: Number(req.params.id) },
        include: issueInclude,
    });

    if (!issue) {
        throw new ApiError(404, "Store issue not found");
    }
    return res.status(200).json(new ApiResponse(200, issue, "Store issue fetched successfully"));
});

const createStoreIssue = asyncHandler(async (req, res) => {
    const { date, bikeQty } = req.body;
    const departmentId = Number(req.body.departmentId);
    const colorId = Number(req.body.colorId);
    const items = normalizeItems(req.body.items);

    console.log(
        `[StoreIssue] Creating issue for department ${departmentId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertLinksExist({ departmentId, colorId, items });
    const facts = await readItemFacts(items.map((item) => item.inventoryId));
    assertEnoughStock(items, facts);
    const department = await prisma.department.findUnique({ where: { id: departmentId }, select: { name: true } });

    // Sync PostgreSQL auto-increment sequences
    await syncSequence("StoreIssue");
    await syncSequence("StoreIssueItem");

    // The slip and its stock movements are saved together, or not at all
    const issue = await getActiveDatabaseClient().$transaction(async (tx) => {
        const created = await tx.storeIssue.create({
            data: {
                date: new Date(date),
                departmentId,
                colorId,
                bikeQty: Number(bikeQty),
                createdById: req.user?.id,
                items: {
                    create: items.map((item) => ({
                        inventoryId: item.inventoryId,
                        issueQty: item.issueQty,
                        // The purpose is the department unless the user wrote something else
                        purpose: item.purpose || department?.name || "",
                        upm: facts.upm.get(item.inventoryId) || 0,
                        handStock: facts.handStock.get(item.inventoryId) || 0,
                    })),
                },
            },
            include: issueInclude,
        });
        await writeMovements(tx, created, req.user?.id);
        return created;
    }, TX_OPTIONS);

    return res.status(201).json(new ApiResponse(201, issue, "Store issue created successfully"));
});

const updateStoreIssue = asyncHandler(async (req, res) => {
    const issueId = Number(req.params.id);
    const body = req.body;

    const existing = await prisma.storeIssue.findUnique({
        where: { id: issueId },
        include: { department: { select: { name: true } } },
    });
    if (!existing) {
        throw new ApiError(404, "Store issue not found");
    }

    const data = { updatedById: req.user?.id };
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.departmentId !== undefined) data.departmentId = Number(body.departmentId);
    if (body.colorId !== undefined) data.colorId = Number(body.colorId);
    if (body.bikeQty !== undefined) data.bikeQty = Number(body.bikeQty);

    const items = body.items !== undefined ? normalizeItems(body.items) : null;
    await assertLinksExist({ departmentId: data.departmentId, colorId: data.colorId, items });

    const facts = items ? await readItemFacts(items.map((item) => item.inventoryId)) : null;
    if (items) {
        const previous = await prisma.storeIssueItem.findMany({ where: { storeIssueId: issueId } });
        assertEnoughStock(items, facts, new Map(previous.map((row) => [row.inventoryId, row.issueQty])));
        await syncSequence("StoreIssueItem");
    }

    let purposeDefault = existing.department?.name || "";
    if (data.departmentId !== undefined && data.departmentId !== existing.departmentId) {
        const department = await prisma.department.findUnique({ where: { id: data.departmentId }, select: { name: true } });
        purposeDefault = department?.name || "";
    }

    const issue = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.storeIssue.update({ where: { id: issueId }, data });

        if (items) {
            // A row that stays keeps the upm / stock recorded when it was issued; a new row reads the current values
            const existingItems = await tx.storeIssueItem.findMany({ where: { storeIssueId: issueId } });
            const existingByInventory = new Map(existingItems.map((row) => [row.inventoryId, row]));
            const keepIds = new Set(items.map((item) => item.inventoryId));

            const removedIds = existingItems.filter((row) => !keepIds.has(row.inventoryId)).map((row) => row.id);
            if (removedIds.length > 0) {
                await tx.storeIssueItem.deleteMany({ where: { id: { in: removedIds } } });
            }

            for (const item of items) {
                const current = existingByInventory.get(item.inventoryId);
                const purpose = item.purpose || purposeDefault;
                if (current) {
                    await tx.storeIssueItem.update({
                        where: { id: current.id },
                        data: { issueQty: item.issueQty, purpose },
                    });
                } else {
                    await tx.storeIssueItem.create({
                        data: {
                            storeIssueId: issueId,
                            inventoryId: item.inventoryId,
                            issueQty: item.issueQty,
                            purpose,
                            upm: facts.upm.get(item.inventoryId) || 0,
                            handStock: facts.handStock.get(item.inventoryId) || 0,
                        },
                    });
                }
            }
        }

        const updated = await tx.storeIssue.findUnique({ where: { id: issueId }, include: issueInclude });
        await writeMovements(tx, updated, req.user?.id);
        return updated;
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, issue, "Store issue updated successfully"));
});

const deleteStoreIssue = asyncHandler(async (req, res) => {
    const issueId = Number(req.params.id);

    const existing = await prisma.storeIssue.findUnique({ where: { id: issueId } });
    if (!existing) {
        throw new ApiError(404, "Store issue not found");
    }

    // The stock goes back: the ledger lines of the slip are removed with it. Item rows are removed automatically.
    await getActiveDatabaseClient().$transaction(async (tx) => {
        await removeMovements(tx, "STORE_ISSUE", issueId);
        await tx.storeIssue.delete({ where: { id: issueId } });
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, null, "Store issue deleted successfully"));
});

const getNextIdStoreIssue = asyncHandler(async (req, res) => {
    const { _max } = await prisma.storeIssue.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[StoreIssue] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Requisition Slip No fetched successfully")
    );
});

export default {
    getAllStoreIssues,
    getByIdStoreIssue,
    createStoreIssue,
    updateStoreIssue,
    deleteStoreIssue,
    getNextIdStoreIssue
};
