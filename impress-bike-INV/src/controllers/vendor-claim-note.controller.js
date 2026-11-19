import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";

// Vendor Claim Note: the claim of the rejected parts of a vendor. The id of the record is the Claim Note No. Every record is returned with its vendor and item rows.
import { isPagedRequest, findPage, pageOfRows } from "../utils/listQuery.js";

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
// and what was already claimed from it. A rejection return can only send back items that were rejected from
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
        prisma.vendorClaimNoteItem.groupBy({
            by: ["inventoryId"],
            where: {
                vendorClaimNote: { vendorId, ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}) },
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

    // The rate of the claim = the rate the rejected parts were BOUGHT at: the rate of the item in the PO (or the
    // approved rate of the quotation) of the inward where it was rejected. It does not follow a later price change.
    // When the rejected quantity of an item comes from several inwards with different rates, the rate is the
    // average of them, weighted by the rejected quantity (4 pcs at 30 and 6 pcs at 40 -> (4x30 + 6x40) / 10 = 36).
    const rejectedLines = await prisma.inwardItem.findMany({
        where: { ...vendorInwardWhere(vendorId), rejQty: { gt: 0 } },
        select: {
            inventoryId: true,
            rejQty: true,
            inventory: { select: { itemName: true } },
            inward: {
                select: {
                    purchaseOrder: { select: { code: true, itemName: true, rate: true } },
                    quotation: { select: { itemName: true, approvedRate: true } },
                },
            },
        },
    });
    const sameName = (a, b) => String(a || "").trim().toLowerCase() === String(b || "").trim().toLowerCase();
    const worthByItem = new Map(); // inventoryId -> { worth, qty }
    for (const line of rejectedLines) {
        const order = line.inward?.purchaseOrder;
        const quotation = line.inward?.quotation;
        let rate;
        if (order) {
            let index = order.code.findIndex((code) => code === line.inventoryId);
            if (index < 0) index = order.itemName.findIndex((name) => sameName(name, line.inventory?.itemName));
            if (index >= 0) rate = order.rate[index];
        } else if (quotation) {
            const index = quotation.itemName.findIndex((name) => sameName(name, line.inventory?.itemName));
            if (index >= 0) rate = quotation.approvedRate[index];
        }
        if (!rate) continue;
        const entry = worthByItem.get(line.inventoryId) || { worth: 0, qty: 0 };
        entry.worth += rate * line.rejQty;
        entry.qty += line.rejQty;
        worthByItem.set(line.inventoryId, entry);
    }
    const rateByItem = new Map([...worthByItem].map(([inventoryId, entry]) => [inventoryId, Math.round(entry.worth / entry.qty)]));

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
                rate: rateByItem.get(row.inventoryId) || 0,
            };
        })
        .sort((a, b) => a.itemName.localeCompare(b.itemName));
};

// exact: a new claim is for ALL that is pending of an item (the form fills the qty, it is not typed)
// Returns what is available per item (with its rate), so the caller can set the rate and amount itself.
const assertReceivedFromVendor = async (vendorId, items, excludeReturnId, { exact = false } = {}) => {
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
        else if (exact && item.rej !== row.maxQty) {
            problems.push(`"${name}": the quantity must be ${row.maxQty} (all the rejected quantity not yet claimed)`);
        } else if (!row.rate) {
            problems.push(`"${name}": no purchase rate was found for it in the PO of its inward`);
        } else if (item.rej > row.maxQty) {
            problems.push(`"${name}": only ${row.maxQty} can be returned (rejected ${row.rejectedQty}, already returned ${row.returnedQty})`);
        }
    }
    if (problems.length > 0) throw new ApiError(400, problems.join(". "));
    return available;
};

// The rate and the amount of every row are worked out here (what the form sends for them is not used)
const withServerRates = (items, available) =>
    items.map((item) => {
        const rate = available.get(item.inventoryId).rate;
        return { ...item, rate, amount: item.rej * rate };
    });

// Items received from a vendor, for the Vendor Claim Note form
const getReceivedItems = asyncHandler(async (req, res) => {
    const vendorId = Number(req.query.vendorId);
    if (!Number.isInteger(vendorId) || vendorId < 1) throw new ApiError(400, "Please select a vendor");
    const excludeId = Number(req.query.excludeId);
    const rows = await getReceivedFromVendor(vendorId, Number.isInteger(excludeId) && excludeId > 0 ? excludeId : undefined);
    if (isPagedRequest(req)) {
        // the picker: only what is still pending, a page at a time (the row id is the item id)
        const pending = rows.filter((row) => row.maxQty > 0).map((row) => ({ ...row, id: row.inventoryId }));
        return res.status(200).json(new ApiResponse(200, pageOfRows(pending, req, (row) => row.itemName), "Received items fetched successfully"));
    }
    return res.status(200).json(new ApiResponse(200, rows, "Received items fetched successfully"));
});

const normalizeItems = (items) =>
    items.map((item) => ({
        inventoryId: Number(item.inventoryId),
        rej: Number(item.rej),
        rate: Number(item.rate),
        amount: Number(item.rej) * Number(item.rate),
        report: item.report || "",
    }));

const getAllVendorClaimNotes = asyncHandler(async (req, res) => {
    if (isPagedRequest(req)) {
        const page = await findPage(prisma.vendorClaimNote, req, {
            searchFields: ["transport", "builtyNo"],
            relationFields: [["vendor", "vendorName"]],
            nestedFields: [["items", "some", "inventory", "itemName"]],
            dateFields: ["date"],
            include: returnInclude,
        });
        return res.status(200).json(new ApiResponse(200, page, "Fetched successfully"));
    }
    const vendorClaimNotes = await prisma.vendorClaimNote.findMany({
        include: returnInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, vendorClaimNotes, "Vendor Claim Notes fetched successfully"));
});

const getByIdVendorClaimNote = asyncHandler(async (req, res) => {
    const vendorClaimNote = await prisma.vendorClaimNote.findUnique({
        where: { id: Number(req.params.id) },
        include: returnInclude,
    });

    if (!vendorClaimNote) {
        throw new ApiError(404, "Vendor Claim Note not found");
    }
    return res.status(200).json(new ApiResponse(200, vendorClaimNote, "Vendor Claim Note fetched successfully"));
});

const createVendorClaimNote = asyncHandler(async (req, res) => {
    const { date, vendorId, address, contactNo, saleTaxNo, transport, builtyNo, bookNo, receivedBy, saleTaxPercent, stInvNo } = req.body;
    let items = normalizeItems(req.body.items);

    console.log(
        `[VendorClaimNote] Creating Return for vendor ${vendorId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertVendorExists(Number(vendorId));
    await assertInventoryExists(items);
    items = withServerRates(items, await assertReceivedFromVendor(Number(vendorId), items, undefined, { exact: true }));

    // Sync PostgreSQL auto-increment sequences
    await syncSequence("VendorClaimNote");
    await syncSequence("VendorClaimNoteItem");

    const vendorClaimNote = await prisma.vendorClaimNote.create({
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
            saleTaxPercent: Number(saleTaxPercent),
            stInvNo,
            createdById: req.user?.id,
            items: { create: items },
        },
        include: returnInclude,
    });

    return res.status(201).json(new ApiResponse(201, vendorClaimNote, "Vendor Claim Note created successfully"));
});

// A claim note is posted when it is saved: after that only a Super Admin can change or delete it
const assertPosted = (user, id) => {
    if (!user?.isSuperAdmin) {
        throw new ApiError(403, `Claim Note #${id} is posted. Only a Super Admin can change it.`);
    }
};

const updateVendorClaimNote = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);
    const body = req.body;

    const existing = await prisma.vendorClaimNote.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Vendor Claim Note not found");
    }
    assertPosted(req.user, returnId);

    const data = { updatedById: req.user?.id };
    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.vendorId !== undefined) {
        await assertVendorExists(Number(body.vendorId));
        data.vendorId = Number(body.vendorId);
    }
    for (const field of ["address", "contactNo", "saleTaxNo", "transport", "builtyNo", "bookNo", "receivedBy", "stInvNo"]) {
        if (body[field] !== undefined) data[field] = body[field];
    }
    if (body.saleTaxPercent !== undefined) data.saleTaxPercent = Number(body.saleTaxPercent);

    let items = body.items !== undefined ? normalizeItems(body.items) : null;
    if (items) {
        await assertInventoryExists(items);
        items = withServerRates(items, await assertReceivedFromVendor(Number(data.vendorId ?? existing.vendorId), items, returnId));
        await syncSequence("VendorClaimNoteItem");
    }

    const vendorClaimNote = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.vendorClaimNote.update({ where: { id: returnId }, data });

        if (items) {
            // Rows that stay are updated, new rows are added, removed rows are deleted
            const existingItems = await tx.vendorClaimNoteItem.findMany({ where: { vendorClaimNoteId: returnId } });
            const existingByInventory = new Map(existingItems.map((row) => [row.inventoryId, row]));
            const keepIds = new Set(items.map((item) => item.inventoryId));

            const removedIds = existingItems.filter((row) => !keepIds.has(row.inventoryId)).map((row) => row.id);
            if (removedIds.length > 0) {
                await tx.vendorClaimNoteItem.deleteMany({ where: { id: { in: removedIds } } });
            }

            for (const item of items) {
                const current = existingByInventory.get(item.inventoryId);
                if (current) {
                    await tx.vendorClaimNoteItem.update({
                        where: { id: current.id },
                        data: { rej: item.rej, rate: item.rate, amount: item.amount, report: item.report },
                    });
                } else {
                    await tx.vendorClaimNoteItem.create({ data: { ...item, vendorClaimNoteId: returnId } });
                }
            }
        }

        return tx.vendorClaimNote.findUnique({ where: { id: returnId }, include: returnInclude });
    });

    return res.status(200).json(new ApiResponse(200, vendorClaimNote, "Vendor Claim Note updated successfully"));
});

const deleteVendorClaimNote = asyncHandler(async (req, res) => {
    const returnId = Number(req.params.id);

    const existing = await prisma.vendorClaimNote.findUnique({ where: { id: returnId } });
    if (!existing) {
        throw new ApiError(404, "Vendor Claim Note not found");
    }
    assertPosted(req.user, returnId);

    // Item rows are removed automatically (onDelete: Cascade)
    await prisma.vendorClaimNote.delete({ where: { id: returnId } });

    return res.status(200).json(new ApiResponse(200, null, "Vendor Claim Note deleted successfully"));
});

const getNextIdVendorClaimNote = asyncHandler(async (req, res) => {
    const { _max } = await prisma.vendorClaimNote.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[VendorClaimNote] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Claim Note No fetched successfully")
    );
});

export default {
    getAllVendorClaimNotes,
    getByIdVendorClaimNote,
    createVendorClaimNote,
    updateVendorClaimNote,
    deleteVendorClaimNote,
    getNextIdVendorClaimNote,
    getReceivedItems
};
