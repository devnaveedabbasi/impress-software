import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";

// The id of the record is the Claim Note No. Every record is returned with its vendor and item rows.
const returnInclude = {
    vendor: { select: { id: true, vendorName: true } },
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

// Return a clear 400 instead of a foreign key error when the vendor / an inventory item does not exist
const assertVendorExists = async (vendorId) => {
    const vendor = await prisma.vendor.findUnique({ where: { id: vendorId }, select: { id: true } });
    if (!vendor) throw new ApiError(400, "Vendor not found");
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

// What a vendor delivered that was REJECTED at inward (from the inwards of its purchase orders / quotations)
// and what was already returned to it. A rejection return can only send back items that were rejected from
// this vendor, and not more than was rejected. "excludeReturnId" leaves out the record being edited.
const vendorInwardWhere = (vendorId) => ({
    inward: { OR: [{ purchaseOrder: { vendorId } }, { quotation: { vendorId } }] },
});

const getReceivedFromVendor = async (vendorId, excludeReturnId) => {
    const [received, returned] = await Promise.all([
        prisma.inwardItem.groupBy({
            by: ["inventoryId"],
            where: vendorInwardWhere(vendorId),
            _sum: { recQty: true, rejQty: true },
        }),
        prisma.rejectionReturnItem.groupBy({
            by: ["inventoryId"],
            where: {
                rejectionReturn: { vendorId, ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}) },
            },
            _sum: { rej: true },
        }),
    ]);

    const returnedByItem = new Map(returned.map((row) => [row.inventoryId, row._sum.rej || 0]));
    const inventories = await prisma.inventory.findMany({
        where: { id: { in: received.map((row) => row.inventoryId) } },
        select: { id: true, itemName: true },
    });
    const nameById = new Map(inventories.map((item) => [item.id, item.itemName]));

    return received
        .filter((row) => (row._sum.rejQty || 0) > 0)
        .map((row) => {
            const receivedQty = row._sum.recQty || 0;
            const rejectedQty = row._sum.rejQty || 0;
            const returnedQty = returnedByItem.get(row.inventoryId) || 0;
            // Only the rejected quantity that has not been sent back yet can be returned
            const maxQty = Math.max(rejectedQty - returnedQty, 0);
            return {
                inventoryId: row.inventoryId,
                itemName: nameById.get(row.inventoryId) || `Item #${row.inventoryId}`,
                receivedQty,
                rejectedQty,
                returnedQty,
                maxQty,
                suggestedQty: maxQty,
            };
        })
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
};

const assertReceivedFromVendor = async (vendorId, items, excludeReturnId) => {
    const available = new Map((await getReceivedFromVendor(vendorId, excludeReturnId)).map((row) => [row.inventoryId, row]));
    const names = new Map(
        (await prisma.inventory.findMany({ where: { id: { in: items.map((item) => item.inventoryId) } }, select: { id: true, itemName: true } })).map(
            (item) => [item.id, item.itemName]
        )
    );
    const problems = [];
    for (const item of items) {
        const name = names.get(item.inventoryId) || `Item #${item.inventoryId}`;
        const row = available.get(item.inventoryId);
        if (!row) problems.push(`"${name}" has no rejected quantity from this vendor`);
        else if (item.rej > row.maxQty) {
            problems.push(`"${name}": only ${row.maxQty} can be returned (rejected ${row.rejectedQty}, already returned ${row.returnedQty})`);
        }
    }
    if (problems.length > 0) throw new ApiError(400, problems.join(". "));
};

// Items received from a vendor, for the Rejection Return form
const getReceivedItems = asyncHandler(async (req, res) => {
    const vendorId = Number(req.query.vendorId);
    if (!Number.isInteger(vendorId) || vendorId < 1) throw new ApiError(400, "Please select a vendor");
    const excludeId = Number(req.query.excludeId);
    const rows = await getReceivedFromVendor(vendorId, Number.isInteger(excludeId) && excludeId > 0 ? excludeId : undefined);
    return res.status(200).json(new ApiResponse(200, rows, "Received items fetched successfully"));
});

const normalizeItems = (items) =>
    items.map((item) => ({
        inventoryId: Number(item.inventoryId),
        rej: Number(item.rej),
        report: item.report || "",
    }));

const getAllRejectionReturns = asyncHandler(async (req, res) => {
    const rejectionReturns = await prisma.rejectionReturnToVendor.findMany({
        include: returnInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, rejectionReturns, "Rejection Returns fetched successfully"));
});

const getByIdRejectionReturn = asyncHandler(async (req, res) => {
    const rejectionReturn = await prisma.rejectionReturnToVendor.findUnique({
        where: { id: Number(req.params.id) },
        include: returnInclude,
    });

    if (!rejectionReturn) {
        throw new ApiError(404, "Rejection Return not found");
    }
    return res.status(200).json(new ApiResponse(200, rejectionReturn, "Rejection Return fetched successfully"));
});

const createRejectionReturn = asyncHandler(async (req, res) => {
    const { date, vendorId, address, contactNo, saleTaxNo, transport, builtyNo, bookNo, receivedBy } = req.body;
    const items = normalizeItems(req.body.items);

    console.log(
        `[RejectionReturnToVendor] Creating Return for vendor ${vendorId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertVendorExists(Number(vendorId));
    await assertInventoryExists(items);
    await assertReceivedFromVendor(Number(vendorId), items);

    // Sync PostgreSQL auto-increment sequences
    await syncSequence("RejectionReturnToVendor");
    await syncSequence("RejectionReturnItem");

    const rejectionReturn = await prisma.rejectionReturnToVendor.create({
        data: {
            date: new Date(date),
            vendorId: Number(vendorId),
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

    return res.status(201).json(new ApiResponse(201, rejectionReturn, "Rejection Return created successfully"));
});

const updateRejectionReturn = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);
    const body = req.body;

    const existing = await prisma.rejectionReturnToVendor.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Rejection Return not found");
    }

    const data = { updatedById: req.user?.id };
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.vendorId !== undefined) {
        await assertVendorExists(Number(body.vendorId));
        data.vendorId = Number(body.vendorId);
    }
    for (const field of ["address", "contactNo", "saleTaxNo", "transport", "builtyNo", "bookNo", "receivedBy"]) {
        if (body[field] !== undefined) data[field] = body[field];
    }

    const items = body.items !== undefined ? normalizeItems(body.items) : null;
    if (items) {
        await assertInventoryExists(items);
        await assertReceivedFromVendor(Number(data.vendorId ?? existing.vendorId), items, returnId);
        await syncSequence("RejectionReturnItem");
    }

    const rejectionReturn = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.rejectionReturnToVendor.update({ where: { id: returnId }, data });

        if (items) {
            // Rows that stay are updated, new rows are added, removed rows are deleted
            const existingItems = await tx.rejectionReturnItem.findMany({ where: { rejectionReturnId: returnId } });
            const existingByInventory = new Map(existingItems.map((row) => [row.inventoryId, row]));
            const keepIds = new Set(items.map((item) => item.inventoryId));

            const removedIds = existingItems.filter((row) => !keepIds.has(row.inventoryId)).map((row) => row.id);
            if (removedIds.length > 0) {
                await tx.rejectionReturnItem.deleteMany({ where: { id: { in: removedIds } } });
            }

            for (const item of items) {
                const current = existingByInventory.get(item.inventoryId);
                if (current) {
                    await tx.rejectionReturnItem.update({
                        where: { id: current.id },
                        data: { rej: item.rej, report: item.report },
                    });
                } else {
                    await tx.rejectionReturnItem.create({ data: { ...item, rejectionReturnId: returnId } });
                }
            }
        }

        return tx.rejectionReturnToVendor.findUnique({ where: { id: returnId }, include: returnInclude });
    });

    return res.status(200).json(new ApiResponse(200, rejectionReturn, "Rejection Return updated successfully"));
});

const deleteRejectionReturn = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);

    const existing = await prisma.rejectionReturnToVendor.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Rejection Return not found");
    }

    // Item rows are removed automatically (onDelete: Cascade)
    await prisma.rejectionReturnToVendor.delete({ where: { id: returnId } });

    return res.status(200).json(new ApiResponse(200, null, "Rejection Return deleted successfully"));
});

const getNextIdRejectionReturn = asyncHandler(async (req, res) => {
    const { _max } = await prisma.rejectionReturnToVendor.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[RejectionReturnToVendor] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Claim Note No fetched successfully")
    );
});

export default {
    getAllRejectionReturns,
    getByIdRejectionReturn,
    createRejectionReturn,
    updateRejectionReturn,
    deleteRejectionReturn,
    getNextIdRejectionReturn,
    getReceivedItems
};
