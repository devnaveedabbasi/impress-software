import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";

const dealerTypes = ['single', 'dealar'];

const isDealerConflict = (error) => {
    const message = String(error?.message || "");
    return (
        error?.code === "P2002" ||
        message.includes("Unique constraint failed")
    );
};

const handleDealerWrite = async (operation) => {
    try {
        return await operation();
    } catch (error) {
        if (isDealerConflict(error)) {
            throw new ApiError(409, "Dealer with this information already exists.");
        }
        throw error;
    }
};

const createDealer = asyncHandler(async (req, res) => {
    const {
        dealarShipName, contactNo, address, saleTaxNo, NTNNo,
        name, provinceId, cityId, mobileNo, opeaningBalance, dealarType, NICNo
    } = req.body;

    if (!dealarShipName?.trim() || !contactNo?.trim() || !address?.trim() || !name?.trim() || !provinceId || !cityId) {
        throw new ApiError(400, "Required dealer fields are missing");
    }

    if (dealarType && !dealerTypes.includes(dealarType)) {
        throw new ApiError(400, "Invalid dealer type");
    }

    const trimmedDealership = dealarShipName.trim();

    console.log(
        `[Dealer] Creating "${trimmedDealership}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"Dealer"', 'id'),
            COALESCE((SELECT MAX(id) FROM "Dealer"), 1),
            EXISTS(SELECT 1 FROM "Dealer")
        )
    `;

    const dealer = await handleDealerWrite(() =>
        prisma.dealer.create({
            data: {
                dealarShipName: trimmedDealership,
                contactNo: String(contactNo).trim(),
                address: address.trim(),
                saleTaxNo: saleTaxNo ? String(saleTaxNo).trim() : "",
                NTNNo: NTNNo ? String(NTNNo).trim() : "",
                name: name.trim(),
                provinceId: Number(provinceId),
                cityId: Number(cityId),
                mobileNo: mobileNo ? String(mobileNo).trim() : "",
                opeaningBalance: Number(opeaningBalance) || 0,
                dealarType: dealarType || "single",
                NICNo: NICNo ? String(NICNo).trim() : "",
                createdById: req.user?.id || 1,
                updatedById: req.user?.id || 1,
            },
        })
    );

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
        orderBy: { id: "asc" },
        include: {
            province: true,
            city: true,
        },
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
            city: true,
        },
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
        where: { id: Number(id) },
    });

    if (!existingDealer) {
        throw new ApiError(404, "Dealer not found");
    }

    if (dealarType && !dealerTypes.includes(dealarType)) {
        throw new ApiError(400, "Invalid dealer type");
    }

    const dealer = await handleDealerWrite(() =>
        prisma.dealer.update({
            where: { id: Number(id) },
            data: {
                dealarShipName: dealarShipName !== undefined ? dealarShipName.trim() : existingDealer.dealarShipName,
                contactNo: contactNo !== undefined ? String(contactNo).trim() : existingDealer.contactNo,
                address: address !== undefined ? address.trim() : existingDealer.address,
                saleTaxNo: saleTaxNo !== undefined ? String(saleTaxNo).trim() : existingDealer.saleTaxNo,
                NTNNo: NTNNo !== undefined ? String(NTNNo).trim() : existingDealer.NTNNo,
                name: name !== undefined ? name.trim() : existingDealer.name,
                provinceId: provinceId ? Number(provinceId) : existingDealer.provinceId,
                cityId: cityId ? Number(cityId) : existingDealer.cityId,
                mobileNo: mobileNo !== undefined ? String(mobileNo).trim() : existingDealer.mobileNo,
                opeaningBalance: opeaningBalance !== undefined ? Number(opeaningBalance) : existingDealer.opeaningBalance,
                dealarType: dealarType || existingDealer.dealarType,
                NICNo: NICNo !== undefined ? String(NICNo).trim() : existingDealer.NICNo,
                updatedById: req.user?.id || existingDealer.updatedById,
            },
        })
    );

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
        where: { id: Number(id) },
    });

    if (!existingDealer) {
        throw new ApiError(404, "Dealer not found");
    }

    const dealer = await prisma.dealer.delete({
        where: { id: Number(id) },
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
    const { _max } = await prisma.dealer.aggregate({
        _max: { id: true },
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Dealer] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
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
    getNextIdDealer,
};
