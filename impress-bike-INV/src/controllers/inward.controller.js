import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";

const getAllInwards = asyncHandler(async (req, res) => {
    const inwards = await prisma.inward.findMany({
        include: { purchaseOrder: { include: { vendor: true } }, quotation: true },
        orderBy: { id: "asc" }
    });
    return res.status(200).json(new ApiResponse(200, inwards, "Inwards fetched successfully"));
});

const getByIdInward = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const inward = await prisma.inward.findUnique({
        where: { id: Number(id) },
        include: { purchaseOrder: { include: { vendor: true } }, quotation: true }
    });

    if (!inward) {
        throw new ApiError(404, "Inward not found");
    }
    return res.status(200).json(new ApiResponse(200, inward, "Inward fetched successfully"));
});

const createInward = asyncHandler(async (req, res) => {
    const { date, Type, purchaseOrderId, quotationId, GRIRNo, DCNo, billNO, detail, code, itemName, poBalQty, recQty, rejQty, okQty, packingDetail } = req.body;

    console.log(
        `[Inward] Creating Inward GRIR "${GRIRNo}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Inward"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Inward"), 1),
            EXISTS(SELECT 1 FROM "Inward")
        )
    `;

    const inward = await prisma.inward.create({
        data: {
            date: new Date(date),
            Type,
            purchaseOrderId: purchaseOrderId ? Number(purchaseOrderId) : null,
            quotationId: quotationId ? Number(quotationId) : null,
            GRIRNo: Number(GRIRNo),
            DCNo: Number(DCNo),
            billNO: billNO ? Number(billNO) : null,
            detail,
            code: code.map(Number),
            itemName,
            poBalQty: poBalQty.map(Number),
            recQty: recQty.map(Number),
            rejQty: rejQty.map(Number),
            okQty: okQty.map(Number),
            packingDetail,
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, inward, "Inward created successfully"));
});

const updateInward = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    const existingInward = await prisma.inward.findUnique({ where: { id: Number(id) } });
    if (!existingInward) {
        throw new ApiError(404, "Inward not found");
    }

    const data = {
        updatedById: req.user?.id
    };

    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.Type !== undefined) data.Type = body.Type;
    if (body.purchaseOrderId !== undefined) data.purchaseOrderId = body.purchaseOrderId ? Number(body.purchaseOrderId) : null;
    if (body.quotationId !== undefined) data.quotationId = body.quotationId ? Number(body.quotationId) : null;
    if (body.GRIRNo !== undefined) data.GRIRNo = Number(body.GRIRNo);
    if (body.DCNo !== undefined) data.DCNo = Number(body.DCNo);
    if (body.billNO !== undefined) data.billNO = body.billNO ? Number(body.billNO) : null;
    if (body.detail !== undefined) data.detail = body.detail;
    
    if (body.code !== undefined) data.code = body.code.map(Number);
    if (body.itemName !== undefined) data.itemName = body.itemName;
    if (body.poBalQty !== undefined) data.poBalQty = body.poBalQty.map(Number);
    if (body.recQty !== undefined) data.recQty = body.recQty.map(Number);
    if (body.rejQty !== undefined) data.rejQty = body.rejQty.map(Number);
    if (body.okQty !== undefined) data.okQty = body.okQty.map(Number);
    if (body.packingDetail !== undefined) data.packingDetail = body.packingDetail;

    const inward = await prisma.inward.update({
        where: { id: Number(id) },
        data
    });

    return res.status(200).json(new ApiResponse(200, inward, "Inward updated successfully"));
});

const deleteInward = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingInward = await prisma.inward.findUnique({ where: { id: Number(id) } });
    if (!existingInward) {
        throw new ApiError(404, "Inward not found");
    }

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
        include: {
            purchaseOrder: { include: { vendor: true } },
            quotation: { include: { vendor: true } }
        },
        orderBy: { date: 'asc' }
    });

    const flattenedReport = [];
    for (const inward of inwards) {
        const vendor = inward.purchaseOrder?.vendor || inward.quotation?.vendor || null;

        if (!inward.itemName || !Array.isArray(inward.itemName)) continue;

        for (let i = 0; i < inward.itemName.length; i++) {
            const rowItemName = inward.itemName[i];
            const rowRecQty = inward.recQty?.[i] || 0;
            const rowRejQty = inward.rejQty?.[i] || 0;
            const rowOkQty = inward.okQty?.[i] || 0;

            if (itemName && rowItemName !== itemName) continue;

            if (status === "rejected" && rowRejQty <= 0) continue;
            if (status === "ok" && rowOkQty <= 0) continue;

            flattenedReport.push({
                inwardId: inward.id,
                date: inward.date,
                grirNo: inward.GRIRNo,
                dcNo: inward.DCNo,
                billNo: inward.billNO,
                poNo: inward.purchaseOrderId || inward.quotationId,
                vendorName: vendor?.vendorName || 'Unknown Vendor',
                vendorId: vendor?.id || null,
                itemName: rowItemName,
                recQty: rowRecQty,
                rejQty: rowRejQty,
                okQty: rowOkQty
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
