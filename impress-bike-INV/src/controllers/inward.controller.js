import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";

// Every inward is returned with its item rows and the linked Inventory item
const inwardInclude = {
    purchaseOrder: { include: { vendor: true } },
    quotation: { include: { vendor: true } },
    items: {
        orderBy: { id: "asc" },
        include: { inventory: { select: { id: true, itemName: true } } },
    },
};

// Normalize item rows from the request. OK Qty is always recalculated on the server (Rec - REJ).
const normalizeItems = (items = []) =>
    items.map((item) => {
        const recQty = Number(item.recQty) || 0;
        const rejQty = Number(item.rejQty) || 0;
        return {
            inventoryId: Number(item.inventoryId),
            poBalQty: Number(item.poBalQty) || 0,
            recQty,
            rejQty,
            okQty: Math.max(recQty - rejQty, 0),
            packingDetail: item.packingDetail ? String(item.packingDetail) : "",
        };
    });

// Make sure every inventoryId really exists, so we return a clear 400 instead of a FK error
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

const toNullableNumber = (value) =>
    value === undefined || value === null || value === "" || Number(value) === 0 ? null : Number(value);

const getAllInwards = asyncHandler(async (req, res) => {
    const inwards = await prisma.inward.findMany({
        include: inwardInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, inwards, "Inwards fetched successfully"));
});

const getByIdInward = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const inward = await prisma.inward.findUnique({
        where: { id: Number(id) },
        include: inwardInclude,
    });

    if (!inward) {
        throw new ApiError(404, "Inward not found");
    }
    return res.status(200).json(new ApiResponse(200, inward, "Inward fetched successfully"));
});

const createInward = asyncHandler(async (req, res) => {
    const { date, Type, purchaseOrderId, quotationId, GRIRNo, DCNo, billNO, detail } = req.body;
    const items = normalizeItems(req.body.items);

    console.log(
        `[Inward] Creating Inward GRIR "${GRIRNo}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertInventoryExists(items);

    const client = getActiveDatabaseClient();

    // Sync PostgreSQL auto-increment sequences
    for (const table of ["Inward", "InwardItem"]) {
        await client.$executeRawUnsafe(`
            SELECT setval(
                pg_get_serial_sequence('"${table}"', 'id'),
                COALESCE((SELECT MAX(id) FROM "${table}"), 1),
                EXISTS(SELECT 1 FROM "${table}")
            )
        `);
    }

    const inward = await prisma.inward.create({
        data: {
            date: new Date(date),
            Type,
            purchaseOrderId: toNullableNumber(purchaseOrderId),
            quotationId: toNullableNumber(quotationId),
            GRIRNo: Number(GRIRNo),
            DCNo: Number(DCNo),
            billNO: toNullableNumber(billNO),
            detail,
            createdById: req.user?.id,
            items: { create: items },
        },
        include: inwardInclude,
    });

    return res.status(201).json(new ApiResponse(201, inward, "Inward created successfully"));
});

const updateInward = asyncHandler(async (req, res) => {
    const inwardId = Number(req.params.id);
    const body = req.body;

    const existingInward = await prisma.inward.findUnique({ where: { id: inwardId } });
    if (!existingInward) {
        throw new ApiError(404, "Inward not found");
    }

    const data = { updatedById: req.user?.id };

    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.Type !== undefined) data.Type = body.Type;
    if (body.purchaseOrderId !== undefined) data.purchaseOrderId = toNullableNumber(body.purchaseOrderId);
    if (body.quotationId !== undefined) data.quotationId = toNullableNumber(body.quotationId);
    if (body.GRIRNo !== undefined) data.GRIRNo = Number(body.GRIRNo);
    if (body.DCNo !== undefined) data.DCNo = Number(body.DCNo);
    if (body.billNO !== undefined) data.billNO = toNullableNumber(body.billNO);
    if (body.detail !== undefined) data.detail = body.detail;

    const items = body.items !== undefined ? normalizeItems(body.items) : null;
    if (items) await assertInventoryExists(items);

    const inward = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.inward.update({ where: { id: inwardId }, data });

        if (items) {
            // Keep rows of items that stay, update them in place; create new ones; delete removed ones
            const existingItems = await tx.inwardItem.findMany({ where: { inwardId } });
            const existingByInventory = new Map(existingItems.map((item) => [item.inventoryId, item]));
            const keepInventoryIds = new Set(items.map((item) => item.inventoryId));

            const removedIds = existingItems
                .filter((item) => !keepInventoryIds.has(item.inventoryId))
                .map((item) => item.id);
            if (removedIds.length > 0) {
                await tx.inwardItem.deleteMany({ where: { id: { in: removedIds } } });
            }

            for (const item of items) {
                const existing = existingByInventory.get(item.inventoryId);
                if (existing) {
                    await tx.inwardItem.update({ where: { id: existing.id }, data: item });
                } else {
                    await tx.inwardItem.create({ data: { ...item, inwardId } });
                }
            }
        }

        return tx.inward.findUnique({ where: { id: inwardId }, include: inwardInclude });
    });

    return res.status(200).json(new ApiResponse(200, inward, "Inward updated successfully"));
});

const deleteInward = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingInward = await prisma.inward.findUnique({ where: { id: Number(id) } });
    if (!existingInward) {
        throw new ApiError(404, "Inward not found");
    }

    // Item rows are removed automatically (onDelete: Cascade)
    await prisma.inward.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Inward deleted successfully"));
});

const getNextIdInward = asyncHandler(async (req, res) => {
    const { _max } = await prisma.inward.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Inward] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Inward ID fetched successfully")
    );
});

const getInwardReport = asyncHandler(async (req, res) => {
    const { vendorId, fromDate, toDate, itemName, status } = req.query;

    const where = {};
    if (fromDate || toDate) {
        where.date = {};
        if (fromDate) where.date.gte = new Date(fromDate);
        if (toDate) where.date.lte = new Date(toDate);
    }

    if (vendorId) {
        where.OR = [
            { purchaseOrder: { vendorId: Number(vendorId) } },
            { quotation: { vendorId: Number(vendorId) } }
        ];
    }

    const inwards = await prisma.inward.findMany({
        where,
        include: inwardInclude,
        orderBy: { date: 'asc' }
    });

    const flattenedReport = [];
    for (const inward of inwards) {
        const vendor = inward.purchaseOrder?.vendor || inward.quotation?.vendor || null;

        for (const item of inward.items || []) {
            const rowItemName = item.inventory?.itemName || "";

            if (itemName && rowItemName !== itemName) continue;
            if (status === "rejected" && item.rejQty <= 0) continue;
            if (status === "ok" && item.okQty <= 0) continue;

            flattenedReport.push({
                inwardId: inward.id,
                date: inward.date,
                grirNo: inward.GRIRNo,
                dcNo: inward.DCNo,
                billNo: inward.billNO,
                poNo: inward.purchaseOrderId || inward.quotationId,
                vendorName: vendor?.vendorName || 'Unknown Vendor',
                vendorId: vendor?.id || null,
                inventoryId: item.inventoryId,
                itemName: rowItemName,
                recQty: item.recQty,
                rejQty: item.rejQty,
                okQty: item.okQty
            });
        }
    }

    return res.status(200).json(new ApiResponse(200, flattenedReport, "Inward report fetched successfully"));
});

export default {
    getAllInwards,
    getByIdInward,
    createInward,
    updateInward,
    deleteInward,
    getNextIdInward,
    getInwardReport
};
