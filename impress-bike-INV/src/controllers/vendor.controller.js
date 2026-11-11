import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const isVendorConflict = (error) => {
    const message = String(error?.message || "");
    return (
        error?.code === "P2002" ||
        message.includes("Unique constraint failed")
    );
};

const handleVendorWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isVendorConflict(error)) {
            throw new ApiError(409, "Vendor with this information already exists.");
        }
        throw error;
    }
};

const createVendor = asyncHandler(async (req, res) => {
    const {
        vendorName, address, saleTaxNo, provinceId, cityId, contactNo,
        NICNo, mobileNo, daysLimit, NTNNo, CNICNo, amoutLimit, openingBalance
    } = req.body;

    if (!vendorName?.trim() || !address?.trim() || !provinceId || !cityId || !contactNo?.trim()) {
        throw new ApiError(400, "Required vendor fields are missing");
    }

    const trimmedVendorName = vendorName.trim();

    console.log(
        `[Vendor] Creating "${trimmedVendorName}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Vendor"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Vendor"), 1),
            EXISTS(SELECT 1 FROM "Vendor")
        )
    `;

    const vendor = await handleVendorWrite(() =>
        prisma.vendor.create({
            data: {
                vendorName: trimmedVendorName,
                address: address.trim(),
                saleTaxNo: saleTaxNo ? String(saleTaxNo).trim() : "",
                provinceId: Number(provinceId),
                cityId: Number(cityId),
                contactNo: String(contactNo).trim(),
                NICNo: NICNo ? String(NICNo).trim() : "",
                mobileNo: mobileNo ? String(mobileNo).trim() : "",
                daysLimit: Number(daysLimit) || 0,
                NTNNo: NTNNo ? String(NTNNo).trim() : "",
                CNICNo: CNICNo ? String(CNICNo).trim() : "",
                amoutLimit: Number(amoutLimit) || 0,
                openingBalance: Number(openingBalance) || 0,
                createdById: req.user?.id || 1,
                updatedById: req.user?.id || 1,
            },
        })
    );

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
        orderBy: { id: "asc" },
        include: {
            city: true,
            province: true,
        },
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
            province: true,
        },
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
        where: { id: Number(id) },
    });

    if (!existingVendor) {
        throw new ApiError(404, "Vendor not found");
    }

    const vendor = await handleVendorWrite(() =>
        prisma.vendor.update({
            where: { id: Number(id) },
            data: {
                vendorName: vendorName !== undefined ? vendorName.trim() : existingVendor.vendorName,
                address: address !== undefined ? address.trim() : existingVendor.address,
                saleTaxNo: saleTaxNo !== undefined ? String(saleTaxNo).trim() : existingVendor.saleTaxNo,
                provinceId: provinceId ? Number(provinceId) : existingVendor.provinceId,
                cityId: cityId ? Number(cityId) : existingVendor.cityId,
                contactNo: contactNo !== undefined ? String(contactNo).trim() : existingVendor.contactNo,
                NICNo: NICNo !== undefined ? String(NICNo).trim() : existingVendor.NICNo,
                mobileNo: mobileNo !== undefined ? String(mobileNo).trim() : existingVendor.mobileNo,
                daysLimit: daysLimit !== undefined ? Number(daysLimit) : existingVendor.daysLimit,
                NTNNo: NTNNo !== undefined ? String(NTNNo).trim() : existingVendor.NTNNo,
                CNICNo: CNICNo !== undefined ? String(CNICNo).trim() : existingVendor.CNICNo,
                amoutLimit: amoutLimit !== undefined ? Number(amoutLimit) : existingVendor.amoutLimit,
                openingBalance: openingBalance !== undefined ? Number(openingBalance) : existingVendor.openingBalance,
                updatedById: req.user?.id || existingVendor.updatedById,
            },
        })
    );

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
        where: { id: Number(id) },
    });

    if (!existingVendor) {
        throw new ApiError(404, "Vendor not found");
    }

    const usedInReturns = await prisma.rejectionReturnToVendor.count({ where: { vendorId: Number(id) } });
    if (usedInReturns > 0) {
        throw new ApiError(
            400,
            `This vendor is used in ${usedInReturns} Rejection Return record(s) and cannot be deleted`
        );
    }

    const vendor = await prisma.vendor.delete({
        where: { id: Number(id) },
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
    const { _max } = await prisma.vendor.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Vendor] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
    getNextIdVendor,
};
