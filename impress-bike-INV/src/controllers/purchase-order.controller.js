import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllPurchaseOrders = asyncHandler(async (req, res) => {
    const purchaseOrders = await prisma.purchaseOrder.findMany({
        include: { vendor: true, quotation: true },
        orderBy: { id: "desc" }
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
    const lastPurchaseOrder = await prisma.purchaseOrder.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastPurchaseOrder ? lastPurchaseOrder.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Purchase Order ID fetched successfully")
    );
});

const getPurchaseOrderBalanceReport = asyncHandler(async (req, res) => {
    const { vendorId, fromDate, toDate, itemName } = req.query;

    const where = {};
    if (fromDate || toDate) {
        where.date = {};
        if (fromDate) where.date.gte = new Date(fromDate);
        if (toDate) where.date.lte = new Date(toDate);
    }
    if (vendorId) where.vendorId = Number(vendorId);

    const purchaseOrders = await prisma.purchaseOrder.findMany({
        where,
        include: { vendor: true },
        orderBy: { date: 'asc' }
    });

    const poIds = purchaseOrders.map((po) => po.id);

    // Sum received quantity per (purchaseOrderId, itemName) across all matching Inward records
    const inwards = await prisma.inward.findMany({
        where: { purchaseOrderId: { in: poIds } }
    });

    const receivedByPoAndItem = {};
    for (const inward of inwards) {
        if (!Array.isArray(inward.itemName)) continue;
        for (let i = 0; i < inward.itemName.length; i++) {
            const key = `${inward.purchaseOrderId}::${inward.itemName[i]}`;
            const rec = inward.recQty?.[i] || 0;
            receivedByPoAndItem[key] = (receivedByPoAndItem[key] || 0) + rec;
        }
    }

    const flattenedReport = [];
    for (const po of purchaseOrders) {
        if (!Array.isArray(po.itemName)) continue;

        for (let i = 0; i < po.itemName.length; i++) {
            const rowItemName = po.itemName[i];
            if (itemName && rowItemName !== itemName) continue;

            const orderedQty = po.quantity?.[i] || 0;
            const receivedQty = receivedByPoAndItem[`${po.id}::${rowItemName}`] || 0;
            const balanceQty = orderedQty - receivedQty;

            flattenedReport.push({
                poId: po.id,
                date: po.date,
                vendorId: po.vendorId,
                vendorName: po.vendor?.vendorName || 'Unknown Vendor',
                itemName: rowItemName,
                orderedQty,
                receivedQty,
                balanceQty
            });
        }
    }

    return res.status(200).json(new ApiResponse(200, flattenedReport, "Purchase Order balance report fetched successfully"));
});

export default {
    getAllPurchaseOrders,
    getByIdPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    getNextIdPurchaseOrder,
    getPurchaseOrderBalanceReport
};
