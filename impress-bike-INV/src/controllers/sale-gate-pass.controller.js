import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllSaleGatePasses = asyncHandler(async (req, res) => {
    const saleGatePasses = await prisma.saleGatePass.findMany({
        orderBy: { id: "desc" }
    });
    return res.status(200).json(new ApiResponse(200, saleGatePasses, "Sale Gate Passes fetched successfully"));
});

const getByIdSaleGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const saleGatePass = await prisma.saleGatePass.findUnique({
        where: { id: Number(id) }
    });

    if (!saleGatePass) {
        throw new ApiError(404, "Sale Gate Pass not found");
    }
    return res.status(200).json(new ApiResponse(200, saleGatePass, "Sale Gate Pass fetched successfully"));
});

const createSaleGatePass = asyncHandler(async (req, res) => {
    const { date, accountName, billNO, throughBy, remarks, vehicleNo, code, itemName, unit, stockInHand, qty } = req.body;

    const saleGatePass = await prisma.saleGatePass.create({
        data: {
            date: new Date(date),
            accountName,
            billNO: Number(billNO),
            throughBy,
            remarks,
            vehicleNo,
            code: code.map(Number),
            itemName,
            unit: unit.map(Number),
            stockInHand: stockInHand.map(Number),
            qty: qty.map(Number),
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, saleGatePass, "Sale Gate Pass created successfully"));
});

const updateSaleGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { date, accountName, billNO, throughBy, remarks, vehicleNo, code, itemName, unit, stockInHand, qty } = req.body;

    const existingGatePass = await prisma.saleGatePass.findUnique({ where: { id: Number(id) } });
    if (!existingGatePass) {
        throw new ApiError(404, "Sale Gate Pass not found");
    }

    const saleGatePass = await prisma.saleGatePass.update({
        where: { id: Number(id) },
        data: {
            date: date !== undefined ? new Date(date) : existingGatePass.date,
            accountName: accountName !== undefined ? accountName : existingGatePass.accountName,
            billNO: billNO !== undefined ? Number(billNO) : existingGatePass.billNO,
            throughBy: throughBy !== undefined ? throughBy : existingGatePass.throughBy,
            remarks: remarks !== undefined ? remarks : existingGatePass.remarks,
            vehicleNo: vehicleNo !== undefined ? vehicleNo : existingGatePass.vehicleNo,
            code: code !== undefined ? code.map(Number) : existingGatePass.code,
            itemName: itemName !== undefined ? itemName : existingGatePass.itemName,
            unit: unit !== undefined ? unit.map(Number) : existingGatePass.unit,
            stockInHand: stockInHand !== undefined ? stockInHand.map(Number) : existingGatePass.stockInHand,
            qty: qty !== undefined ? qty.map(Number) : existingGatePass.qty,
            updatedById: req.user?.id
        }
    });

    return res.status(200).json(new ApiResponse(200, saleGatePass, "Sale Gate Pass updated successfully"));
});

const deleteSaleGatePass = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingGatePass = await prisma.saleGatePass.findUnique({ where: { id: Number(id) } });
    if (!existingGatePass) {
        throw new ApiError(404, "Sale Gate Pass not found");
    }

    await prisma.saleGatePass.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Sale Gate Pass deleted successfully"));
});

const getNextIdSaleGatePass = asyncHandler(async (req, res) => {
    const lastGatePass = await prisma.saleGatePass.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastGatePass ? lastGatePass.id + 1 : 1;

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
