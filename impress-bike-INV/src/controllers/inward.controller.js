import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { parsePaging, pagingMeta, buildDateRange, parseVendorId } from "../utils/reportQuery.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { replaceMovements, removeMovements, TX_OPTIONS } from "../services/stock.service.js";

// Every inward is returned with its item rows and the linked Inventory item
import { isPagedRequest, findPage } from "../utils/listQuery.js";

const inwardInclude = {
    purchaseOrder: { include: { vendor: true } },
    quotation: { include: { vendor: true } },
    items: {
        orderBy: { id: "asc" },
        include: { inventory: { select: { id: true, itemName: true } } },
    },
};

// Normalize item rows from the request. OK Qty is always recalculated on the server (Rec - REJ).
const normalizeItems = (items = []) =>
    items.map((item) => {
        const recQty = Number(item.recQty) || 0;
        const rejQty = Number(item.rejQty) || 0;
        return {
            inventoryId: Number(item.inventoryId),
            poBalQty: Number(item.poBalQty) || 0,
            recQty,
            rejQty,
            okQty: Math.max(recQty - rejQty, 0),
            packingDetail: item.packingDetail ? String(item.packingDetail) : "",
        };
    });

// Make sure every inventoryId really exists, so we return a clear 400 instead of a FK error
const assertInventoryExists = async (items) => {
    const ids = [...new Set(items.map((item) => item.inventoryId))];
    const found = await prisma.inventory.findMany({
        where: { id: { in: ids } },
        select: { id: true },
    });
    const foundIds = new Set(found.map((item) => item.id));
    const missing = ids.filter((id) => !foundIds.has(id));
    if (missing.length > 0) {
        throw new ApiError(400, `Inventory item(s) not found: ${missing.join(", ")}`);
    }
};

// Only the OK quantity goes to the stock: the rejected quantity is not usable stock. One + ledger line per item.
const writeMovements = (tx, inward, userId) =>
    replaceMovements(tx, {
        sourceType: "INWARD",
        sourceId: inward.id,
        date: inward.date,
        rows: inward.items.map((item) => ({ inventoryId: item.inventoryId, qty: item.okQty })),
        userId,
        note: `Inward #${inward.id} (GRIR ${inward.GRIRNo})`,
    });

const toNullableNumber = (value) =>
    value === undefined || value === null || value === "" || Number(value) === 0 ? null : Number(value);

// An inward AGAINST A PO can only receive the items of that PO, and for every item not more than is still to come
// (ordered - already received in the other inwards of the same PO). The form shows the same limits; the server makes
// sure of them, because the "PO Bal Qty" of a row is sent by the form and cannot be trusted.
const assertAgainstPo = async ({ Type, purchaseOrderId }, items, excludeInwardId) => {
    if (Type !== "againstPO") return;
    const poId = toNullableNumber(purchaseOrderId);
    if (!poId) return;

    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { id: true, code: true, quantity: true } });
    if (!po) throw new ApiError(400, `Purchase Order #${poId} not found`);

    const ordered = new Map();
    po.code.forEach((inventoryId, index) => ordered.set(inventoryId, (ordered.get(inventoryId) || 0) + (po.quantity[index] || 0)));

    const received = await prisma.inwardItem.groupBy({
        by: ["inventoryId"],
        where: { inward: { purchaseOrderId: poId, ...(excludeInwardId ? { id: { not: excludeInwardId } } : {}) } },
        _sum: { recQty: true },
    });
    const receivedBy = new Map(received.map((row) => [row.inventoryId, row._sum.recQty || 0]));

    const names = new Map(
        (await prisma.inventory.findMany({ where: { id: { in: items.map((item) => item.inventoryId) } }, select: { id: true, itemName: true } })).map(
            (item) => [item.id, item.itemName]
        )
    );

    const problems = [];
    for (const item of items) {
        const name = names.get(item.inventoryId) || `Item #${item.inventoryId}`;
        if (!ordered.has(item.inventoryId)) {
            problems.push(`"${name}" is not in PO #${poId}`);
            continue;
        }
        const balance = Math.max(ordered.get(item.inventoryId) - (receivedBy.get(item.inventoryId) || 0), 0);
        if (item.recQty > balance) {
            problems.push(`"${name}": Rec Qty (${item.recQty}) is more than what is left of PO #${poId} (${balance})`);
        }
    }
    if (problems.length > 0) throw new ApiError(400, problems.join(". "));
};

const getAllInwards = asyncHandler(async (req, res) => {
    if (isPagedRequest(req)) {
        const page = await findPage(prisma.inward, req, {
            numberFields: ["GRIRNo", "DCNo", "billNO"],
            nestedFields: [
                ["purchaseOrder", "vendor", "vendorName"],
                ["quotation", "vendor", "vendorName"],
                ["items", "some", "inventory", "itemName"],
            ],
            dateFields: ["date"],
            include: inwardInclude,
        });
        return res.status(200).json(new ApiResponse(200, page, "Fetched successfully"));
    }
    const inwards = await prisma.inward.findMany({
        include: inwardInclude,
        orderBy: { id: "asc" },
    });
    return res.status(200).json(new ApiResponse(200, inwards, "Inwards fetched successfully"));
});

const getByIdInward = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const inward = await prisma.inward.findUnique({
        where: { id: Number(id) },
        include: inwardInclude,
    });

    if (!inward) {
        throw new ApiError(404, "Inward not found");
    }
    return res.status(200).json(new ApiResponse(200, inward, "Inward fetched successfully"));
});

const createInward = asyncHandler(async (req, res) => {
    const { date, Type, purchaseOrderId, quotationId, GRIRNo, DCNo, billNO, detail } = req.body;
    const items = normalizeItems(req.body.items);

    console.log(
        `[Inward] Creating Inward GRIR "${GRIRNo}" in ${getActiveDatabaseName().toUpperCase()} database`
    );

    await assertInventoryExists(items);
    await assertAgainstPo({ Type, purchaseOrderId }, items);

    const client = getActiveDatabaseClient();

    // Sync PostgreSQL auto-increment sequences
    for (const table of ["Inward", "InwardItem"]) {
        await client.$executeRawUnsafe(`
            SELECT setval(
                pg_get_serial_sequence('"${table}"', 'id'),
                COALESCE((SELECT MAX(id) FROM "${table}"), 1),
                EXISTS(SELECT 1 FROM "${table}")
            )
        `);
    }

    // The inward and its stock movements are saved together, or not at all
    const inward = await client.$transaction(async (tx) => {
        const created = await tx.inward.create({
            data: {
                date: new Date(date),
                Type,
                purchaseOrderId: toNullableNumber(purchaseOrderId),
                quotationId: toNullableNumber(quotationId),
                GRIRNo: Number(GRIRNo),
                DCNo: Number(DCNo),
                billNO: toNullableNumber(billNO),
                detail,
                createdById: req.user?.id,
                items: { create: items },
            },
            include: inwardInclude,
        });
        await writeMovements(tx, created, req.user?.id);
        return created;
    }, TX_OPTIONS);

    return res.status(201).json(new ApiResponse(201, inward, "Inward created successfully"));
});

const updateInward = asyncHandler(async (req, res) => {
    const inwardId = Number(req.params.id);
    const body = req.body;

    const existingInward = await prisma.inward.findUnique({ where: { id: inwardId } });
    if (!existingInward) {
        throw new ApiError(404, "Inward not found");
    }

    // An inward whose bill is approved (posted) is locked with it, only a Super Admin can change it
    const postedBill = await prisma.vendorBill.findUnique({ where: { inwardId }, select: { id: true, status: true } });
    if (postedBill?.status === "APPROVED" && !req.user?.isSuperAdmin) {
        throw new ApiError(403, `Inward #${inwardId} has an approved vendor bill (#${postedBill.id}). Only a Super Admin can change it.`);
    }

    const data = { updatedById: req.user?.id };

    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.Type !== undefined) data.Type = body.Type;
    if (body.purchaseOrderId !== undefined) data.purchaseOrderId = toNullableNumber(body.purchaseOrderId);
    if (body.quotationId !== undefined) data.quotationId = toNullableNumber(body.quotationId);
    if (body.GRIRNo !== undefined) data.GRIRNo = Number(body.GRIRNo);
    if (body.DCNo !== undefined) data.DCNo = Number(body.DCNo);
    if (body.billNO !== undefined) data.billNO = toNullableNumber(body.billNO);
    if (body.detail !== undefined) data.detail = body.detail;

    const items = body.items !== undefined ? normalizeItems(body.items) : null;
    if (items) {
        await assertInventoryExists(items);
        await assertAgainstPo(
            {
                Type: body.Type ?? existingInward.Type,
                purchaseOrderId: body.purchaseOrderId !== undefined ? body.purchaseOrderId : existingInward.purchaseOrderId,
            },
            items,
            inwardId
        );
    }

    const inward = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.inward.update({ where: { id: inwardId }, data });

        if (items) {
            // Keep rows of items that stay, update them in place; create new ones; delete removed ones
            const existingItems = await tx.inwardItem.findMany({ where: { inwardId } });
            const existingByInventory = new Map(existingItems.map((item) => [item.inventoryId, item]));
            const keepInventoryIds = new Set(items.map((item) => item.inventoryId));

            const removedIds = existingItems
                .filter((item) => !keepInventoryIds.has(item.inventoryId))
                .map((item) => item.id);
            if (removedIds.length > 0) {
                await tx.inwardItem.deleteMany({ where: { id: { in: removedIds } } });
            }

            for (const item of items) {
                const existing = existingByInventory.get(item.inventoryId);
                if (existing) {
                    await tx.inwardItem.update({ where: { id: existing.id }, data: item });
                } else {
                    await tx.inwardItem.create({ data: { ...item, inwardId } });
                }
            }
        }

        const updated = await tx.inward.findUnique({ where: { id: inwardId }, include: inwardInclude });
        await writeMovements(tx, updated, req.user?.id);
        return updated;
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, inward, "Inward updated successfully"));
});

const deleteInward = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingInward = await prisma.inward.findUnique({ where: { id: Number(id) } });
    if (!existingInward) {
        throw new ApiError(404, "Inward not found");
    }

    const bill = await prisma.vendorBill.findUnique({ where: { inwardId: Number(id) }, select: { id: true } });
    if (bill) {
        throw new ApiError(400, `Inward #${id} has vendor bill #${bill.id}. Delete the bill first.`);
    }

    // The ledger lines of the inward are removed with it. Item rows are removed automatically (onDelete: Cascade)
    await getActiveDatabaseClient().$transaction(async (tx) => {
        await removeMovements(tx, "INWARD", Number(id));
        await tx.inward.delete({ where: { id: Number(id) } });
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, null, "Inward deleted successfully"));
});

const getNextIdInward = asyncHandler(async (req, res) => {
    const { _max } = await prisma.inward.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[Inward] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Inward ID fetched successfully")
    );
});

const getInwardReport = asyncHandler(async (req, res) => {
    const { vendorId, fromDate, toDate, itemName, status, inwardId } = req.query;
    const paging = parsePaging(req.query);

    // ID-wise: the report of one inward. The inward must exist, otherwise the user gets a clear message.
    let document;
    const inwardWhere = {};
    if (inwardId !== undefined && inwardId !== "") {
        const id = Number(inwardId);
        if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Inward No is not valid");
        const found = await prisma.inward.findUnique({ where: { id }, include: inwardInclude });
        if (!found) throw new ApiError(404, `Inward #${id} not found`);
        inwardWhere.id = id;
        const vendorInfo = found.purchaseOrder?.vendor || found.quotation?.vendor || null;
        document = {
            inwardId: found.id,
            date: found.date,
            type: found.Type,
            poNo: found.purchaseOrderId,
            vendorName: vendorInfo?.vendorName || null,
            grirNo: found.GRIRNo,
            dcNo: found.DCNo,
            billNo: found.billNO,
            detail: found.detail,
        };
    }

    // Filters are applied by the database, only the requested page is loaded
    const date = buildDateRange({ fromDate, toDate });
    if (date && !document) inwardWhere.date = date;
    const vendor = parseVendorId(vendorId);
    if (vendor && !document) {
        inwardWhere.OR = [
            { purchaseOrder: { vendorId: vendor } },
            { quotation: { vendorId: vendor } }
        ];
    }

    const where = { inward: inwardWhere };
    if (itemName) where.inventory = { itemName: String(itemName) };
    if (status === "rejected") where.rejQty = { gt: 0 };
    if (status === "ok") where.okQty = { gt: 0 };

    const vendorSelect = { select: { vendor: { select: { id: true, vendorName: true } } } };
    const [total, sums, rows] = await Promise.all([
        prisma.inwardItem.count({ where }),
        prisma.inwardItem.aggregate({ where, _sum: { recQty: true, rejQty: true, okQty: true } }),
        prisma.inwardItem.findMany({
            where,
            skip: paging.skip,
            take: paging.limit,
            orderBy: [{ inward: { date: "asc" } }, { inwardId: "asc" }, { id: "asc" }],
            include: {
                inventory: { select: { itemName: true } },
                inward: {
                    select: {
                        id: true,
                        date: true,
                        GRIRNo: true,
                        DCNo: true,
                        billNO: true,
                        purchaseOrderId: true,
                        quotationId: true,
                        purchaseOrder: vendorSelect,
                        quotation: vendorSelect,
                    },
                },
            },
        }),
    ]);

    const report = rows.map((item) => {
        const vendorInfo = item.inward.purchaseOrder?.vendor || item.inward.quotation?.vendor || null;
        return {
            inwardId: item.inward.id,
            date: item.inward.date,
            grirNo: item.inward.GRIRNo,
            dcNo: item.inward.DCNo,
            billNo: item.inward.billNO,
            poNo: item.inward.purchaseOrderId || item.inward.quotationId,
            vendorName: vendorInfo?.vendorName || "Unknown Vendor",
            vendorId: vendorInfo?.id || null,
            inventoryId: item.inventoryId,
            itemName: item.inventory?.itemName || "",
            recQty: item.recQty,
            rejQty: item.rejQty,
            okQty: item.okQty
        };
    });

    return res.status(200).json({
        ...new ApiResponse(200, report, "Inward report fetched successfully"),
        meta: {
            ...pagingMeta(total, paging),
            totals: {
                recQty: sums._sum.recQty || 0,
                rejQty: sums._sum.rejQty || 0,
                okQty: sums._sum.okQty || 0,
            },
            ...(document ? { document } : {}),
        },
    });
});

export default {
    getAllInwards,
    getByIdInward,
    createInward,
    updateInward,
    deleteInward,
    getNextIdInward,
    getInwardReport
};
