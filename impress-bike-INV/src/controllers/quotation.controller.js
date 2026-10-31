import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllQuotations = asyncHandler(async (req, res) => {
    const quotations = await prisma.quotation.findMany({
        include: {
            vendor: true
        },
        orderBy: { id: "desc" }
    });
    return res.status(200).json(new ApiResponse(200, quotations, "Quotations fetched successfully"));
});

const getByIdQuotation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const quotation = await prisma.quotation.findUnique({
        where: { id: Number(id) },
        include: {
            vendor: true
        }
    });

    if (!quotation) {
        throw new ApiError(404, "Quotation not found");
    }
    return res.status(200).json(new ApiResponse(200, quotation, "Quotation fetched successfully"));
});

const createQuotation = asyncHandler(async (req, res) => {
    const { date, vendorId, remarks, itemName, oldRate, proposedRate, approvedRate } = req.body;

    const quotation = await prisma.quotation.create({
        data: {
            date: new Date(date),
            vendorId: Number(vendorId),
            remarks,
            itemName,
            oldRate: oldRate.map(Number),
            proposedRate: proposedRate.map(Number),
            approvedRate: approvedRate.map(Number),
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, quotation, "Quotation created successfully"));
});

const updateQuotation = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { date, vendorId, remarks, itemName, oldRate, proposedRate, approvedRate } = req.body;

    const existingQuotation = await prisma.quotation.findUnique({ where: { id: Number(id) } });
    if (!existingQuotation) {
        throw new ApiError(404, "Quotation not found");
    }

    const quotation = await prisma.quotation.update({
        where: { id: Number(id) },
        data: {
            date: date !== undefined ? new Date(date) : existingQuotation.date,
            vendorId: vendorId !== undefined ? Number(vendorId) : existingQuotation.vendorId,
            remarks: remarks !== undefined ? remarks : existingQuotation.remarks,
            itemName: itemName !== undefined ? itemName : existingQuotation.itemName,
            oldRate: oldRate !== undefined ? oldRate.map(Number) : existingQuotation.oldRate,
            proposedRate: proposedRate !== undefined ? proposedRate.map(Number) : existingQuotation.proposedRate,
            approvedRate: approvedRate !== undefined ? approvedRate.map(Number) : existingQuotation.approvedRate,
            updatedById: req.user?.id
        }
    });

    return res.status(200).json(new ApiResponse(200, quotation, "Quotation updated successfully"));
});

const deleteQuotation = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingQuotation = await prisma.quotation.findUnique({ where: { id: Number(id) } });
    if (!existingQuotation) {
        throw new ApiError(404, "Quotation not found");
    }

    await prisma.quotation.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Quotation deleted successfully"));
});

const getNextIdQuotation = asyncHandler(async (req, res) => {
    const lastQuotation = await prisma.quotation.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastQuotation ? lastQuotation.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Quotation ID fetched successfully"
        )
    );
});

export default {
    getAllQuotations,
    getByIdQuotation,
    createQuotation,
    updateQuotation,
    deleteQuotation,
    getNextIdQuotation
};
