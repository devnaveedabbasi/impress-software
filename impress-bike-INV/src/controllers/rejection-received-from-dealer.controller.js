import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";

// The id of the record is the Claim Note No. Every record is returned with its dealer and item rows.
const returnInclude = {
    dealer: { select: { id: true, dealarShipName: true } },
    items: {
        orderBy: { id: "asc" },
        include: { inventory: { select: { id: true, itemName: true } } },
    },
};

const syncSequence = (table) =>
    getActiveDatabaseClient().$executeRawUnsafe(`
        SELECT setval(
            pg_get_serial_sequence('"${table}"', 'id'),
            COALESCE((SELECT MAX(id) FROM "${table}"), 1),
            EXISTS(SELECT 1 FROM "${table}")
        )
    `);

// Return a clear 400 instead of a foreign key error when the dealer / an inventory item does not exist
const assertDealerExists = async (dealerId) => {
    const dealer = await prisma.dealer.findUnique({ where: { id: dealerId }, select: { id: true } });
    if (!dealer) throw new ApiError(400, "Dealer not found");
};

const assertInventoryExists = async (items) => {
    const ids = [...new Set(items.map((item) => item.inventoryId))];
    const found = await prisma.inventory.findMany({ where: { id: { in: ids } }, select: { id: true } });
    const foundIds = new Set(found.map((item) => item.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
        throw new ApiError(400, `Inventory item(s) not found: ${missing.join(", ")}`);
    }
};

const normalizeItems = (items) =>
    items.map((item) => ({
        inventoryId: Number(item.inventoryId),
        rej: Number(item.rej),
        report: item.report || "",
    }));

const getAllRejectionReceiveds = asyncHandler(async (req, res) => {
    const rejectionReceiveds = await prisma.rejectionReceivedFromDealer.findMany({
        include: returnInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, rejectionReceiveds, "Rejection Receipts fetched successfully"));
});

const getByIdRejectionReceived = asyncHandler(async (req, res) => {
    const rejectionReceived = await prisma.rejectionReceivedFromDealer.findUnique({
        where: { id: Number(req.params.id) },
        include: returnInclude,
    });

    if (!rejectionReceived) {
        throw new ApiError(404, "Rejection Received not found");
    }
    return res.status(200).json(new ApiResponse(200, rejectionReceived, "Rejection Received fetched successfully"));
});

const createRejectionReceived = asyncHandler(async (req, res) => {
    const { date, dealerId, address, contactNo, saleTaxNo, transport, builtyNo, bookNo, receivedBy } = req.body;
    const items = normalizeItems(req.body.items);

    console.log(
        `[RejectionReceivedFromDealer] Creating Return for dealer ${dealerId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertDealerExists(Number(dealerId));
    await assertInventoryExists(items);

    // Sync PostgreSQL auto-increment sequences
    await syncSequence("RejectionReceivedFromDealer");
    await syncSequence("RejectionReceivedItem");

    const rejectionReceived = await prisma.rejectionReceivedFromDealer.create({
        data: {
            date: new Date(date),
            dealerId: Number(dealerId),
            address,
            contactNo,
            saleTaxNo,
            transport,
            builtyNo: builtyNo || "",
            bookNo: bookNo || "",
            receivedBy,
            createdById: req.user?.id,
            items: { create: items },
        },
        include: returnInclude,
    });

    return res.status(201).json(new ApiResponse(201, rejectionReceived, "Rejection Received created successfully"));
});

const updateRejectionReceived = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);
    const body = req.body;

    const existing = await prisma.rejectionReceivedFromDealer.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Rejection Received not found");
    }

    const data = { updatedById: req.user?.id };
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.dealerId !== undefined) {
        await assertDealerExists(Number(body.dealerId));
        data.dealerId = Number(body.dealerId);
    }
    for (const field of ["address", "contactNo", "saleTaxNo", "transport", "builtyNo", "bookNo", "receivedBy"]) {
        if (body[field] !== undefined) data[field] = body[field];
    }

    const items = body.items !== undefined ? normalizeItems(body.items) : null;
    if (items) {
        await assertInventoryExists(items);
        await syncSequence("RejectionReceivedItem");
    }

    const rejectionReceived = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.rejectionReceivedFromDealer.update({ where: { id: returnId }, data });

        if (items) {
            // Rows that stay are updated, new rows are added, removed rows are deleted
            const existingItems = await tx.rejectionReceivedItem.findMany({ where: { rejectionReceivedId: returnId } });
            const existingByInventory = new Map(existingItems.map((row) => [row.inventoryId, row]));
            const keepIds = new Set(items.map((item) => item.inventoryId));

            const removedIds = existingItems.filter((row) => !keepIds.has(row.inventoryId)).map((row) => row.id);
            if (removedIds.length > 0) {
                await tx.rejectionReceivedItem.deleteMany({ where: { id: { in: removedIds } } });
            }

            for (const item of items) {
                const current = existingByInventory.get(item.inventoryId);
                if (current) {
                    await tx.rejectionReceivedItem.update({
                        where: { id: current.id },
                        data: { rej: item.rej, report: item.report },
                    });
                } else {
                    await tx.rejectionReceivedItem.create({ data: { ...item, rejectionReceivedId: returnId } });
                }
            }
        }

        return tx.rejectionReceivedFromDealer.findUnique({ where: { id: returnId }, include: returnInclude });
    });

    return res.status(200).json(new ApiResponse(200, rejectionReceived, "Rejection Received updated successfully"));
});

const deleteRejectionReceived = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);

    const existing = await prisma.rejectionReceivedFromDealer.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Rejection Received not found");
    }

    // Item rows are removed automatically (onDelete: Cascade)
    await prisma.rejectionReceivedFromDealer.delete({ where: { id: returnId } });

    return res.status(200).json(new ApiResponse(200, null, "Rejection Received deleted successfully"));
});

const getNextIdRejectionReceived = asyncHandler(async (req, res) => {
    const { _max } = await prisma.rejectionReceivedFromDealer.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[RejectionReceivedFromDealer] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Claim Note No fetched successfully")
    );
});

export default {
    getAllRejectionReceiveds,
    getByIdRejectionReceived,
    createRejectionReceived,
    updateRejectionReceived,
    deleteRejectionReceived,
    getNextIdRejectionReceived
};
