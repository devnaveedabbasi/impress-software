import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const dealerTypes = ['single', 'dealar']; // Based on enum DealerType

const createDealer = asyncHandler(async (req, res) => {
    const {
        dealarShipName, contactNo, address, saleTaxNo, NTNNo,
        name, provinceId, cityId, mobileNo, opeaningBalance, dealarType, NICNo
    } = req.body;

    if (!dealarShipName || !contactNo || !address || !saleTaxNo || !NTNNo || !name || !provinceId || !cityId || !mobileNo || opeaningBalance === undefined || !dealarType || !NICNo) {
        throw new ApiError(400, "All fields are required");
    }

    if (!dealerTypes.includes(dealarType)) {
        throw new ApiError(400, "Invalid dealer type");
    }

    const dealer = await prisma.dealer.create({
        data: {
            dealarShipName,
            contactNo,
            address,
            saleTaxNo,
            NTNNo,
            name,
            provinceId: Number(provinceId),
            cityId: Number(cityId),
            mobileNo,
            opeaningBalance: Number(opeaningBalance),
            dealarType,
            NICNo,
            createdById: req.user?.id || 1, // Fallback if no user, though auth middleware should provide it
            updatedById: req.user?.id || 1
        },
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            dealer,
            "Dealer created successfully"
        )
    );
});

const getAllDealers = asyncHandler(async (req, res) => {
    const dealers = await prisma.dealer.findMany({
        include: {
            province: true,
            city: true
        }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            dealers,
            "Dealers fetched successfully"
        )
    );
});

const getByIdDealer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Dealer id is required");
    }

    const dealer = await prisma.dealer.findUnique({
        where: { id: Number(id) },
        include: {
            province: true,
            city: true
        }
    });

    if (!dealer) {
        throw new ApiError(404, "Dealer not found");
    }


    return res.status(200).json(
        new ApiResponse(
            200,
            dealer,
            "Dealer fetched successfully"
        )
    );
});

const updateDealer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        dealarShipName, contactNo, address, saleTaxNo, NTNNo,
        name, provinceId, cityId, mobileNo, opeaningBalance, dealarType, NICNo
    } = req.body;

    if (!id) {
        throw new ApiError(400, "Dealer id is required");
    }

    const existingDealer = await prisma.dealer.findUnique({
        where: { id: Number(id) }
    });

    if (!existingDealer) {
        throw new ApiError(404, "Dealer not found");
    }

    if (dealarType && !dealerTypes.includes(dealarType)) {
        throw new ApiError(400, "Invalid dealer type");
    }

    const dealer = await prisma.dealer.update({
        where: { id: Number(id) },
        data: {
            dealarShipName: dealarShipName || existingDealer.dealarShipName,
            contactNo: contactNo || existingDealer.contactNo,
            address: address || existingDealer.address,
            saleTaxNo: saleTaxNo || existingDealer.saleTaxNo,
            NTNNo: NTNNo || existingDealer.NTNNo,
            name: name || existingDealer.name,
            provinceId: provinceId ? Number(provinceId) : existingDealer.provinceId,
            cityId: cityId ? Number(cityId) : existingDealer.cityId,
            mobileNo: mobileNo || existingDealer.mobileNo,
            opeaningBalance: opeaningBalance !== undefined ? Number(opeaningBalance) : existingDealer.opeaningBalance,
            dealarType: dealarType || existingDealer.dealarType,
            NICNo: NICNo || existingDealer.NICNo,
            updatedById: req.user?.id || existingDealer.updatedById
        },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            dealer,
            "Dealer updated successfully"
        )
    );
});

const deleteDealer = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Dealer id is required");
    }

    const existingDealer = await prisma.dealer.findUnique({
        where: { id: Number(id) }
    });

    if (!existingDealer) {
        throw new ApiError(404, "Dealer not found");
    }

    const dealer = await prisma.dealer.delete({
        where: { id: Number(id) }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            dealer,
            "Dealer deleted successfully"
        )
    );
});

const getNextIdDealer = asyncHandler(async (req, res) => {
    const lastDealer = await prisma.dealer.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastDealer ? lastDealer.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Dealer ID fetched successfully"
        )
    );
});

export default {
    createDealer,
    getAllDealers,
    getByIdDealer,
    updateDealer,
    deleteDealer,
    getNextIdDealer
};
