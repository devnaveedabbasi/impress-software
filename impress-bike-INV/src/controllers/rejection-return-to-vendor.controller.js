import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const getAllRejectionReturns = asyncHandler(async (req, res) => {
    const rejectionReturns = await prisma.rejectionReturnToVendor.findMany({
        orderBy: { id: "desc" }
    });
    return res.status(200).json(new ApiResponse(200, rejectionReturns, "Rejection Returns fetched successfully"));
});

const getByIdRejectionReturn = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const rejectionReturn = await prisma.rejectionReturnToVendor.findUnique({
        where: { id: Number(id) }
    });

    if (!rejectionReturn) {
        throw new ApiError(404, "Rejection Return not found");
    }
    return res.status(200).json(new ApiResponse(200, rejectionReturn, "Rejection Return fetched successfully"));
});

const createRejectionReturn = asyncHandler(async (req, res) => {
    const { 
        claimNoteId, date, vendorName, address, contactNo, saleTaxNo, 
        transport, builtyNo, bookNo, receivedBy, itemName, rej, report 
    } = req.body;

    const rejectionReturn = await prisma.rejectionReturnToVendor.create({
        data: {
            claimNoteId: Number(claimNoteId),
            date: new Date(date),
            vendorName,
            address,
            contactNo,
            saleTaxNo,
            transport,
            builtyNo,
            bookNo,
            receivedBy,
            itemName,
            rej: rej.map(Number),
            report,
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, rejectionReturn, "Rejection Return created successfully"));
});

const updateRejectionReturn = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { 
        claimNoteId, date, vendorName, address, contactNo, saleTaxNo, 
        transport, builtyNo, bookNo, receivedBy, itemName, rej, report 
    } = req.body;

    const existingRecord = await prisma.rejectionReturnToVendor.findUnique({ where: { id: Number(id) } });
    if (!existingRecord) {
        throw new ApiError(404, "Rejection Return not found");
    }

    const rejectionReturn = await prisma.rejectionReturnToVendor.update({
        where: { id: Number(id) },
        data: {
            claimNoteId: claimNoteId !== undefined ? Number(claimNoteId) : existingRecord.claimNoteId,
            date: date !== undefined ? new Date(date) : existingRecord.date,
            vendorName: vendorName !== undefined ? vendorName : existingRecord.vendorName,
            address: address !== undefined ? address : existingRecord.address,
            contactNo: contactNo !== undefined ? contactNo : existingRecord.contactNo,
            saleTaxNo: saleTaxNo !== undefined ? saleTaxNo : existingRecord.saleTaxNo,
            transport: transport !== undefined ? transport : existingRecord.transport,
            builtyNo: builtyNo !== undefined ? builtyNo : existingRecord.builtyNo,
            bookNo: bookNo !== undefined ? bookNo : existingRecord.bookNo,
            receivedBy: receivedBy !== undefined ? receivedBy : existingRecord.receivedBy,
            itemName: itemName !== undefined ? itemName : existingRecord.itemName,
            rej: rej !== undefined ? rej.map(Number) : existingRecord.rej,
            report: report !== undefined ? report : existingRecord.report,
            updatedById: req.user?.id
        }
    });

    return res.status(200).json(new ApiResponse(200, rejectionReturn, "Rejection Return updated successfully"));
});

const deleteRejectionReturn = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingRecord = await prisma.rejectionReturnToVendor.findUnique({ where: { id: Number(id) } });
    if (!existingRecord) {
        throw new ApiError(404, "Rejection Return not found");
    }

    await prisma.rejectionReturnToVendor.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Rejection Return deleted successfully"));
});

const getNextIdRejectionReturn = asyncHandler(async (req, res) => {
    const lastRecord = await prisma.rejectionReturnToVendor.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastRecord ? lastRecord.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next ID fetched successfully"
        )
    );
});

export default {
    getAllRejectionReturns,
    getByIdRejectionReturn,
    createRejectionReturn,
    updateRejectionReturn,
    deleteRejectionReturn,
    getNextIdRejectionReturn
};
