import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";

const createVendor = asyncHandler(async (req, res) => {
    const {
        vendorName, address, saleTaxNo, provinceId, cityId, contactNo,
        NICNo, mobileNo, daysLimit, NTNNo, CNICNo, amoutLimit, openingBalance
    } = req.body;

    if (!vendorName || !address || !saleTaxNo || !provinceId || !cityId || !contactNo || !NICNo || !mobileNo || daysLimit === undefined || !NTNNo || !CNICNo || amoutLimit === undefined || openingBalance === undefined) {
        throw new ApiError(400, "All fields are required");
    }

    const vendor = await prisma.vendor.create({
        data: {
            vendorName,
            address,
            saleTaxNo,
            provinceId: Number(provinceId),
            cityId: Number(cityId),
            contactNo,
            NICNo,
            mobileNo,
            daysLimit: Number(daysLimit),
            NTNNo,
            CNICNo,
            amoutLimit: Number(amoutLimit),
            openingBalance: Number(openingBalance),
            createdById: req.user?.id || 1, // Fallback if no user
            updatedById: req.user?.id || 1
        },
    });

    return res.status(201).json(
        new ApiResponse(
            201,
            vendor,
            "Vendor created successfully"
        )
    );
});

const getAllVendors = asyncHandler(async (req, res) => {
    const vendors = await prisma.vendor.findMany({
        include: {
            city: true,
            province: true
        }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            vendors,
            "Vendors fetched successfully"
        )
    );
});

const getByIdVendor = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Vendor id is required");
    }

    const vendor = await prisma.vendor.findUnique({
        where: { id: Number(id) },
        include: {
            city: true,
            province: true
        }
    });

    if (!vendor) {
        throw new ApiError(404, "Vendor not found");
    }

    return res.status(200).json(
        new ApiResponse(
            200,
            vendor,
            "Vendor fetched successfully"
        )
    );
});

const updateVendor = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const {
        vendorName, address, saleTaxNo, provinceId, cityId, contactNo,
        NICNo, mobileNo, daysLimit, NTNNo, CNICNo, amoutLimit, openingBalance
    } = req.body;

    if (!id) {
        throw new ApiError(400, "Vendor id is required");
    }

    const existingVendor = await prisma.vendor.findUnique({
        where: { id: Number(id) }
    });

    if (!existingVendor) {
        throw new ApiError(404, "Vendor not found");
    }

    const vendor = await prisma.vendor.update({
        where: { id: Number(id) },
        data: {
            vendorName: vendorName || existingVendor.vendorName,
            address: address || existingVendor.address,
            saleTaxNo: saleTaxNo || existingVendor.saleTaxNo,
            provinceId: provinceId ? Number(provinceId) : existingVendor.provinceId,
            cityId: cityId ? Number(cityId) : existingVendor.cityId,
            contactNo: contactNo || existingVendor.contactNo,
            NICNo: NICNo || existingVendor.NICNo,
            mobileNo: mobileNo || existingVendor.mobileNo,
            daysLimit: daysLimit !== undefined ? Number(daysLimit) : existingVendor.daysLimit,
            NTNNo: NTNNo || existingVendor.NTNNo,
            CNICNo: CNICNo || existingVendor.CNICNo,
            amoutLimit: amoutLimit !== undefined ? Number(amoutLimit) : existingVendor.amoutLimit,
            openingBalance: openingBalance !== undefined ? Number(openingBalance) : existingVendor.openingBalance,
            updatedById: req.user?.id || existingVendor.updatedById
        },
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            vendor,
            "Vendor updated successfully"
        )
    );
});

const deleteVendor = asyncHandler(async (req, res) => {
    const { id } = req.params;
    if (!id) {
        throw new ApiError(400, "Vendor id is required");
    }

    const existingVendor = await prisma.vendor.findUnique({
        where: { id: Number(id) }
    });

    if (!existingVendor) {
        throw new ApiError(404, "Vendor not found");
    }

    const vendor = await prisma.vendor.delete({
        where: { id: Number(id) }
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            vendor,
            "Vendor deleted successfully"
        )
    );
});

const getNextIdVendor = asyncHandler(async (req, res) => {
    const lastVendor = await prisma.vendor.findFirst({
        orderBy: { id: 'desc' }
    });

    const nextId = lastVendor ? lastVendor.id + 1 : 1;

    return res.status(200).json(
        new ApiResponse(
            200,
            { nextId },
            "Next Vendor ID fetched successfully"
        )
    );
});

export default {
    createVendor,
    getAllVendors,
    getByIdVendor,
    updateVendor,
    deleteVendor,
    getNextIdVendor
};
