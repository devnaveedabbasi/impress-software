import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { getStockInHand, replaceMovements, removeMovements, TX_OPTIONS } from "../services/stock.service.js";

const saleGatePassInclude = {
    items: {
        orderBy: { id: "asc" },
        include: { inventory: { select: { id: true, itemName: true } } },
    },
};

const normalizeItems = (items = []) => {
    if (!Array.isArray(items)) {
        throw new ApiError(400, "Sale gate pass items must be an array");
    }

    // Stock in hand is not taken from the client: the server reads it from the inventory (see readStockInHand)
    const normalized = items.map((item) => ({
        inventoryId: Number(item?.inventoryId),
        unit: item?.unit === undefined || item?.unit === null ? "" : String(item.unit).trim(),
        qty: Number(item?.qty),
    }));

    if (normalized.some((item) =>
        !Number.isInteger(item.inventoryId) ||
        item.inventoryId < 1 ||
        !Number.isInteger(item.qty) ||
        item.qty < 1
    )) {
        throw new ApiError(400, "Each sale gate pass item must have a valid inventory item and quantity");
    }

    if (new Set(normalized.map((item) => item.inventoryId)).size !== normalized.length) {
        throw new ApiError(400, "The same inventory item cannot be added twice");
    }

    return normalized;
};

const assertInventoryExists = async (items) => {
    const ids = [...new Set(items.map((item) => item.inventoryId))];
    const found = await prisma.inventory.findMany({
        where: { id: { in: ids } },
        select: { id: true },
    });
    const foundIds = new Set(found.map((item) => item.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
        throw new ApiError(400, `Inventory item(s) not found: ${missing.join(", ")}`);
    }
};

// Stock in hand = inventory master stock + the stock ledger (see stock.service.js)
const readStockInHand = (inventoryIds) => getStockInHand(inventoryIds);

// The items leave the store: one negative ledger line per item
const writeMovements = (tx, gatePass, userId) =>
    replaceMovements(tx, {
        sourceType: "SALE_GATE_PASS",
        sourceId: gatePass.id,
        date: gatePass.date,
        rows: gatePass.items.map((item) => ({ inventoryId: item.inventoryId, qty: -item.qty })),
        userId,
        note: `Sale Gate Pass #${gatePass.id}`,
    });

// Bill No is optional
const normalizeBill = (value) => (value === undefined || value === null || value === "" ? null : Number(value));

const getAllSaleGatePasses = asyncHandler(async (req, res) => {
    const saleGatePasses = await prisma.saleGatePass.findMany({
        include: saleGatePassInclude,
        orderBy: { id: "asc" }
    });
    return res.status(200).json(new ApiResponse(200, saleGatePasses, "Sale Gate Passes fetched successfully"));
});

const getByIdSaleGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const saleGatePass = await prisma.saleGatePass.findUnique({
        where: { id: Number(id) },
        include: saleGatePassInclude,
    });

    if (!saleGatePass) {
        throw new ApiError(404, "Sale Gate Pass not found");
    }
    return res.status(200).json(new ApiResponse(200, saleGatePass, "Sale Gate Pass fetched successfully"));
});

const createSaleGatePass = asyncHandler(async (req, res) => {
    const { date, accountName, billNO, throughBy, remarks, vehicleNo } = req.body;
    const items = normalizeItems(req.body.items);

    console.log(
        `[SaleGatePass] Creating Sale Gate Pass for "${accountName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    if (items.length === 0) {
        throw new ApiError(400, "At least one sale gate pass item is required");
    }
    await assertInventoryExists(items);
    const stockByInventory = await readStockInHand(items.map((item) => item.inventoryId));

    // Sync PostgreSQL auto-increment sequence
    for (const table of ["SaleGatePass", "SaleGatePassItem"]) {
        await getActiveDatabaseClient().$executeRawUnsafe(`
            SELECT setval(
                pg_get_serial_sequence('"${table}"', 'id'),
                COALESCE((SELECT MAX(id) FROM "${table}"), 1),
                EXISTS(SELECT 1 FROM "${table}")
            )
        `);
    }

    // The gate pass and its stock movements are saved together, or not at all
    const saleGatePass = await getActiveDatabaseClient().$transaction(async (tx) => {
        const created = await tx.saleGatePass.create({
            data: {
                date: new Date(date),
                accountName,
                billNO: normalizeBill(billNO),
                throughBy: throughBy || "",
                remarks: remarks || "",
                vehicleNo: vehicleNo || "",
                createdById: req.user?.id,
                items: {
                    create: items.map((item) => ({
                        ...item,
                        stockInHand: stockByInventory.get(item.inventoryId) || 0,
                    })),
                },
            },
            include: saleGatePassInclude,
        });
        await writeMovements(tx, created, req.user?.id);
        return created;
    }, TX_OPTIONS);

    return res.status(201).json(new ApiResponse(201, saleGatePass, "Sale Gate Pass created successfully"));
});

const updateSaleGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { date, accountName, billNO, throughBy, remarks, vehicleNo } = req.body;
    const body = req.body;

    const existingGatePass = await prisma.saleGatePass.findUnique({ where: { id: Number(id) } });
    if (!existingGatePass) {
        throw new ApiError(404, "Sale Gate Pass not found");
    }

    const items = body.items !== undefined ? normalizeItems(body.items) : null;
    if (items) {
        if (items.length === 0) {
            throw new ApiError(400, "At least one sale gate pass item is required");
        }
        await assertInventoryExists(items);
    }
    const stockByInventory = items ? await readStockInHand(items.map((item) => item.inventoryId)) : new Map();

    const saleGatePass = await getActiveDatabaseClient().$transaction(async (tx) => {
        const data = { updatedById: req.user?.id };
        if (date !== undefined) data.date = new Date(date);
        if (accountName !== undefined) data.accountName = accountName;
        if (billNO !== undefined) data.billNO = normalizeBill(billNO);
        if (throughBy !== undefined) data.throughBy = throughBy;
        if (remarks !== undefined) data.remarks = remarks;
        if (vehicleNo !== undefined) data.vehicleNo = vehicleNo;

        await tx.saleGatePass.update({ where: { id: Number(id) }, data });

        if (items) {
            // A row that stays keeps the stock that was recorded when it was issued; a new row reads the current stock
            const previousRows = await tx.saleGatePassItem.findMany({ where: { saleGatePassId: Number(id) } });
            const previousStock = new Map(previousRows.map((row) => [row.inventoryId, row.stockInHand]));

            await tx.saleGatePassItem.deleteMany({ where: { saleGatePassId: Number(id) } });
            await tx.saleGatePassItem.createMany({
                data: items.map((item) => ({
                    ...item,
                    saleGatePassId: Number(id),
                    stockInHand: previousStock.has(item.inventoryId)
                        ? previousStock.get(item.inventoryId)
                        : stockByInventory.get(item.inventoryId) || 0,
                })),
            });
        }

        const updated = await tx.saleGatePass.findUnique({
            where: { id: Number(id) },
            include: saleGatePassInclude,
        });
        await writeMovements(tx, updated, req.user?.id);
        return updated;
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, saleGatePass, "Sale Gate Pass updated successfully"));
});

const deleteSaleGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingGatePass = await prisma.saleGatePass.findUnique({ where: { id: Number(id) } });
    if (!existingGatePass) {
        throw new ApiError(404, "Sale Gate Pass not found");
    }

    // The stock goes back: the ledger lines of the gate pass are removed with it. Item rows are removed automatically.
    await getActiveDatabaseClient().$transaction(async (tx) => {
        await removeMovements(tx, "SALE_GATE_PASS", Number(id));
        await tx.saleGatePass.delete({ where: { id: Number(id) } });
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, null, "Sale Gate Pass deleted successfully"));
});

const getNextIdSaleGatePass = asyncHandler(async (req, res) => {
    const { _max } = await prisma.saleGatePass.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[SaleGatePass] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Sale Gate Pass ID fetched successfully"
        )
    );
});

export default {
    getAllSaleGatePasses,
    getByIdSaleGatePass,
    createSaleGatePass,
    updateSaleGatePass,
    deleteSaleGatePass,
    getNextIdSaleGatePass
};
