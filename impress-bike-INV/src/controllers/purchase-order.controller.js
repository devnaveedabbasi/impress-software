import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { parsePaging, pagingMeta, buildDateRange, parseVendorId } from "../utils/reportQuery.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";

const getAllPurchaseOrders = asyncHandler(async (req, res) => {
    const purchaseOrders = await prisma.purchaseOrder.findMany({
        include: { vendor: true, quotation: true },
        orderBy: { id: "asc" }
    });
    return res.status(200).json(new ApiResponse(200, purchaseOrders, "Purchase Orders fetched successfully"));
});

const getByIdPurchaseOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: Number(id) },
        include: { vendor: true, quotation: true }
    });

    if (!purchaseOrder) {
        throw new ApiError(404, "Purchase Order not found");
    }
    return res.status(200).json(new ApiResponse(200, purchaseOrder, "Purchase Order fetched successfully"));
});

const createPurchaseOrder = asyncHandler(async (req, res) => {
    const { date, vendorId, validity, instruction, quotationId, code, itemName, unit, quantity, rate, amount, total, saleTaxPercent, totalWithSaleTax, withHoldingPercent, withHoldingAmount, grandTotal } = req.body;

    console.log(
        `[PurchaseOrder] Creating PO for Vendor ${vendorId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"PurchaseOrder"', 'id'),
            COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 1),
            EXISTS(SELECT 1 FROM "PurchaseOrder")
        )
    `;

    const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
            date: new Date(date),
            vendorId: Number(vendorId),
            validity,
            instruction,
            quotationId: Number(quotationId),
            code: code.map(Number),
            itemName,
            unit: unit.map(Number),
            quantity: quantity.map(Number),
            rate: rate.map(Number),
            amount: amount.map(Number),
            total: Number(total),
            saleTaxPercent: Number(saleTaxPercent),
            totalWithSaleTax: Number(totalWithSaleTax),
            withHoldingPercent: Number(withHoldingPercent),
            withHoldingAmount: Number(withHoldingAmount),
            grandTotal: Number(grandTotal),
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, purchaseOrder, "Purchase Order created successfully"));
});

const updatePurchaseOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: Number(id) } });
    if (!existingPurchaseOrder) {
        throw new ApiError(404, "Purchase Order not found");
    }

    const data = {
        updatedById: req.user?.id
    };

    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.vendorId !== undefined) data.vendorId = Number(body.vendorId);
    if (body.validity !== undefined) data.validity = body.validity;
    if (body.instruction !== undefined) data.instruction = body.instruction;
    if (body.quotationId !== undefined) data.quotationId = Number(body.quotationId);
    
    if (body.code !== undefined) data.code = body.code.map(Number);
    if (body.itemName !== undefined) data.itemName = body.itemName;
    if (body.unit !== undefined) data.unit = body.unit.map(Number);
    if (body.quantity !== undefined) data.quantity = body.quantity.map(Number);
    if (body.rate !== undefined) data.rate = body.rate.map(Number);
    if (body.amount !== undefined) data.amount = body.amount.map(Number);

    if (body.total !== undefined) data.total = Number(body.total);
    if (body.saleTaxPercent !== undefined) data.saleTaxPercent = Number(body.saleTaxPercent);
    if (body.totalWithSaleTax !== undefined) data.totalWithSaleTax = Number(body.totalWithSaleTax);
    if (body.withHoldingPercent !== undefined) data.withHoldingPercent = Number(body.withHoldingPercent);
    if (body.withHoldingAmount !== undefined) data.withHoldingAmount = Number(body.withHoldingAmount);
    if (body.grandTotal !== undefined) data.grandTotal = Number(body.grandTotal);

    const purchaseOrder = await prisma.purchaseOrder.update({
        where: { id: Number(id) },
        data
    });

    return res.status(200).json(new ApiResponse(200, purchaseOrder, "Purchase Order updated successfully"));
});

const deletePurchaseOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: Number(id) } });
    if (!existingPurchaseOrder) {
        throw new ApiError(404, "Purchase Order not found");
    }

    await prisma.purchaseOrder.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Purchase Order deleted successfully"));
});

const getNextIdPurchaseOrder = asyncHandler(async (req, res) => {
    const { _max } = await prisma.purchaseOrder.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[PurchaseOrder] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Purchase Order ID fetched successfully")
    );
});

const getPurchaseOrderBalanceReport = asyncHandler(async (req, res) => {
    const { vendorId, fromDate, toDate, itemName } = req.query;
    const paging = parsePaging(req.query);

    // Purchase orders are read page by page; the received qty is then loaded only for this page
    const where = {};
    const date = buildDateRange({ fromDate, toDate });
    if (date) where.date = date;
    const vendor = parseVendorId(vendorId);
    if (vendor) where.vendorId = vendor;
    if (itemName) where.itemName = { has: String(itemName) };

    const [total, purchaseOrders] = await Promise.all([
        prisma.purchaseOrder.count({ where }),
        prisma.purchaseOrder.findMany({
            where,
            include: { vendor: true },
            orderBy: { id: "asc" },
            skip: paging.skip,
            take: paging.limit,
        }),
    ]);

    const poIds = purchaseOrders.map((po) => po.id);
    const receivedItems = poIds.length
        ? await prisma.inwardItem.findMany({
            where: { inward: { purchaseOrderId: { in: poIds } } },
            select: {
                recQty: true,
                inventory: { select: { itemName: true } },
                inward: { select: { purchaseOrderId: true } },
            },
        })
        : [];

    // PO rows store the item name, inward rows are linked to Inventory: match on the item name
    const normalizeName = (name) => String(name || "").trim().toLowerCase();
    const receivedByPoAndItem = new Map();
    for (const item of receivedItems) {
        const key = `${item.inward.purchaseOrderId}::${normalizeName(item.inventory?.itemName)}`;
        receivedByPoAndItem.set(key, (receivedByPoAndItem.get(key) || 0) + (item.recQty || 0));
    }

    const report = [];
    for (const po of purchaseOrders) {
        if (!Array.isArray(po.itemName)) continue;

        // A PO can list the same item on several rows: add them up so the received qty is subtracted once
        const orderedByItem = new Map();
        po.itemName.forEach((name, i) => {
            const key = normalizeName(name);
            const entry = orderedByItem.get(key) || { itemName: name, orderedQty: 0 };
            entry.orderedQty += po.quantity?.[i] || 0;
            orderedByItem.set(key, entry);
        });

        for (const [key, entry] of orderedByItem) {
            if (itemName && key !== normalizeName(itemName)) continue;
            const receivedQty = receivedByPoAndItem.get(`${po.id}::${key}`) || 0;
            report.push({
                poId: po.id,
                date: po.date,
                vendorId: po.vendorId,
                vendorName: po.vendor?.vendorName || "Unknown Vendor",
                itemName: entry.itemName,
                orderedQty: entry.orderedQty,
                receivedQty,
                balanceQty: entry.orderedQty - receivedQty
            });
        }
    }

    return res.status(200).json({
        ...new ApiResponse(200, report, "Purchase Order balance report fetched successfully"),
        meta: pagingMeta(total, paging),
    });
});

// Purchase Order report. Without an item: one row per purchase order (date-wise / vendor-wise).
// With an item: one row per order line of that item. Read page by page like the other reports.
const getPurchaseOrderReport = asyncHandler(async (req, res) => {
    const { vendorId, fromDate, toDate, itemName } = req.query;
    const paging = parsePaging(req.query);

    const where = {};
    const date = buildDateRange({ fromDate, toDate });
    if (date) where.date = date;
    const vendor = parseVendorId(vendorId);
    if (vendor) where.vendorId = vendor;
    const item = typeof itemName === "string" ? itemName.trim() : "";
    if (item) where.itemName = { has: item };

    const [total, sums, purchaseOrders] = await Promise.all([
        prisma.purchaseOrder.count({ where }),
        item ? Promise.resolve(null) : prisma.purchaseOrder.aggregate({ where, _sum: { total: true, grandTotal: true } }),
        prisma.purchaseOrder.findMany({
            where,
            include: { vendor: { select: { vendorName: true } } },
            orderBy: { id: "asc" },
            skip: paging.skip,
            take: paging.limit,
        }),
    ]);

    const normalizeName = (name) => String(name || "").trim().toLowerCase();
    const rows = [];
    for (const po of purchaseOrders) {
        const vendorName = po.vendor?.vendorName || "Unknown Vendor";
        if (!item) {
            rows.push({
                poId: po.id,
                date: po.date,
                vendorId: po.vendorId,
                vendorName,
                validity: po.validity,
                itemsCount: Array.isArray(po.itemName) ? po.itemName.length : 0,
                total: po.total,
                saleTaxPercent: po.saleTaxPercent,
                grandTotal: po.grandTotal,
            });
            continue;
        }
        (po.itemName || []).forEach((name, index) => {
            if (normalizeName(name) !== normalizeName(item)) return;
            rows.push({
                poId: po.id,
                date: po.date,
                vendorId: po.vendorId,
                vendorName,
                itemName: name,
                quantity: po.quantity?.[index] || 0,
                rate: po.rate?.[index] || 0,
                amount: po.amount?.[index] || 0,
            });
        });
    }

    return res.status(200).json({
        ...new ApiResponse(200, rows, "Purchase Order report fetched successfully"),
        meta: {
            ...pagingMeta(total, paging),
            ...(sums ? { totals: { total: sums._sum.total || 0, grandTotal: sums._sum.grandTotal || 0 } } : {}),
        },
    });
});

export default {
    getAllPurchaseOrders,
    getByIdPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    getNextIdPurchaseOrder,
    getPurchaseOrderBalanceReport,
    getPurchaseOrderReport
};
