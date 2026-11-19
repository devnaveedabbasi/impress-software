import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { parsePaging, pagingMeta, buildDateRange, parseVendorId } from "../utils/reportQuery.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";

// The totals of a PO are worked out here, from the rows and the two percents. What the page sent for the totals
// is not trusted, and a row whose Amount is not Qty x Rate is refused. Money is saved in whole numbers.
import { isPagedRequest, findPage } from "../utils/listQuery.js";

// The rules of the rows of a new Purchase Order (the form follows them, the server makes sure):
//   - Unit is a whole number, 1 or more (how many bikes the order is for)
//   - Qty = Unit x the "Unit Per Bike" of the item (from the inventory)
//   - Rate = the APPROVED rate of that item in the quotation of the order
const assertOrderRows = async ({ quotationId, code, itemName, unit, quantity, rate }) => {
    const quotation = await prisma.quotation.findUnique({
        where: { id: Number(quotationId) },
        select: { itemName: true, approvedRate: true },
    });
    if (!quotation) throw new ApiError(400, "Quotation not found");

    const approved = new Map();
    quotation.itemName.forEach((name, index) => approved.set(String(name).trim().toLowerCase(), quotation.approvedRate[index]));

    const inventories = await prisma.inventory.findMany({
        where: { id: { in: code.map(Number) } },
        select: { id: true, unitPerBike: true },
    });
    const perBikeOf = new Map(inventories.map((item) => [item.id, item.unitPerBike]));

    code.forEach((itemCode, index) => {
        const label = `Row ${index + 1} (${itemName[index]})`;
        const perBike = perBikeOf.get(Number(itemCode));
        if (perBike === undefined) throw new ApiError(400, `${label}: the item is not in the inventory`);
        if (!(perBike >= 1)) throw new ApiError(400, `${label}: "Unit Per Bike" is not set for this item in the inventory`);

        const units = Number(unit[index]);
        if (!Number.isInteger(units) || units < 1) throw new ApiError(400, `${label}: Unit must be a whole number, 1 or more`);
        if (Number(quantity[index]) !== units * perBike) {
            throw new ApiError(400, `${label}: Qty must be Unit x Unit Per Bike (${units} x ${perBike} = ${units * perBike})`);
        }

        const approvedRate = approved.get(String(itemName[index]).trim().toLowerCase());
        if (approvedRate === undefined || approvedRate === null) {
            throw new ApiError(400, `${label}: this item has no approved rate in the quotation`);
        }
        if (Number(rate[index]) !== Number(approvedRate)) {
            throw new ApiError(400, `${label}: Rate must be the approved rate of the quotation (${approvedRate})`);
        }
    });
};

// The tax amounts are shown EXACTLY (to the paisa, two decimals at most): 4% of 20 is 0.8, not 1.
// The database keeps whole rupees for them (its columns are whole numbers), so what is saved is rounded, and what is
// shown is always worked out again from the saved total and the percents (withExactWorth).
const round2 = (value) => Math.round(value * 100) / 100;
const exactWorth = ({ total, saleTaxPercent, withHoldingPercent }) => {
    const saleTaxAmount = round2((Number(total) * Number(saleTaxPercent)) / 100);
    const totalWithSaleTax = round2(Number(total) + saleTaxAmount);
    const withHoldingAmount = round2((totalWithSaleTax * Number(withHoldingPercent)) / 100);
    return { saleTaxAmount, totalWithSaleTax, withHoldingAmount, grandTotal: round2(totalWithSaleTax - withHoldingAmount) };
};
const withExactWorth = (po) => (po ? { ...po, ...exactWorth(po) } : po);

const worthOf = ({ quantity, rate, amount, saleTaxPercent, withHoldingPercent }) => {
    quantity.forEach((qty, index) => {
        if (Number(amount[index]) !== Number(qty) * Number(rate[index])) {
            throw new ApiError(400, `Row ${index + 1}: Amount must be Qty x Rate (${qty} x ${rate[index]} = ${Number(qty) * Number(rate[index])})`);
        }
    });
    const total = amount.reduce((sum, value) => sum + Number(value), 0);
    // what is saved: whole rupees (see above)
    const exact = exactWorth({ total, saleTaxPercent, withHoldingPercent });
    return {
        total,
        totalWithSaleTax: Math.round(exact.totalWithSaleTax),
        withHoldingAmount: Math.round(exact.withHoldingAmount),
        grandTotal: Math.round(exact.grandTotal),
    };
};

const getAllPurchaseOrders = asyncHandler(async (req, res) => {
    if (isPagedRequest(req)) {
        const page = await findPage(prisma.purchaseOrder, req, {
            relationFields: [["vendor", "vendorName"]],
            dateFields: ["date"],
            include: { vendor: true, quotation: true },
        });
        return res.status(200).json(new ApiResponse(200, { ...page, items: page.items.map(withExactWorth) }, "Fetched successfully"));
    }
    const purchaseOrders = await prisma.purchaseOrder.findMany({
        include: { vendor: true, quotation: true },
        orderBy: { id: "asc" }
    });
    return res.status(200).json(new ApiResponse(200, purchaseOrders.map(withExactWorth), "Purchase Orders fetched successfully"));
});

const getByIdPurchaseOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const purchaseOrder = await prisma.purchaseOrder.findUnique({
        where: { id: Number(id) },
        include: { vendor: true, quotation: true }
    });

    if (!purchaseOrder) {
        throw new ApiError(404, "Purchase Order not found");
    }
    return res.status(200).json(new ApiResponse(200, withExactWorth(purchaseOrder), "Purchase Order fetched successfully"));
});

const createPurchaseOrder = asyncHandler(async (req, res) => {
    const { date, vendorId, validity, instruction, quotationId, code, itemName, unit, quantity, rate, amount, total, saleTaxPercent, totalWithSaleTax, withHoldingPercent, withHoldingAmount, grandTotal } = req.body;

    console.log(
        `[PurchaseOrder] Creating PO for Vendor ${vendorId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    // Sync PostgreSQL auto-increment sequence
    await getActiveDatabaseClient().$executeRaw`
        SELECT setval(
            pg_get_serial_sequence('"PurchaseOrder"', 'id'),
            COALESCE((SELECT MAX(id) FROM "PurchaseOrder"), 1),
            EXISTS(SELECT 1 FROM "PurchaseOrder")
        )
    `;

    await assertOrderRows({ quotationId, code, itemName, unit, quantity, rate });

    const worth = worthOf({ quantity, rate, amount, saleTaxPercent, withHoldingPercent });

    const purchaseOrder = await prisma.purchaseOrder.create({
        data: {
            date: new Date(date),
            vendorId: Number(vendorId),
            validity,
            instruction,
            quotationId: Number(quotationId),
            code: code.map(Number),
            itemName,
            unit: unit.map(Number),
            quantity: quantity.map(Number),
            rate: rate.map(Number),
            amount: amount.map(Number),
            total: worth.total,
            saleTaxPercent: Number(saleTaxPercent),
            totalWithSaleTax: worth.totalWithSaleTax,
            withHoldingPercent: Number(withHoldingPercent),
            withHoldingAmount: worth.withHoldingAmount,
            grandTotal: worth.grandTotal,
            createdById: req.user?.id
        }
    });

    return res.status(201).json(new ApiResponse(201, withExactWorth(purchaseOrder), "Purchase Order created successfully"));
});

const updatePurchaseOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;
    const body = req.body;

    const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: Number(id) } });
    if (!existingPurchaseOrder) {
        throw new ApiError(404, "Purchase Order not found");
    }
    // A Purchase Order cannot be changed once it is saved
    throw new ApiError(403, "A saved Purchase Order cannot be edited");

    // eslint-disable-next-line no-unreachable
    const data = {
        updatedById: req.user?.id
    };

    if (body.date !== undefined) data.date = new Date(body.date);
    if (body.vendorId !== undefined) data.vendorId = Number(body.vendorId);
    if (body.validity !== undefined) data.validity = body.validity;
    if (body.instruction !== undefined) data.instruction = body.instruction;
    if (body.quotationId !== undefined) data.quotationId = Number(body.quotationId);
    
    if (body.code !== undefined) data.code = body.code.map(Number);
    if (body.itemName !== undefined) data.itemName = body.itemName;
    if (body.unit !== undefined) data.unit = body.unit.map(Number);
    if (body.quantity !== undefined) data.quantity = body.quantity.map(Number);
    if (body.rate !== undefined) data.rate = body.rate.map(Number);
    if (body.amount !== undefined) data.amount = body.amount.map(Number);

    if (body.saleTaxPercent !== undefined) data.saleTaxPercent = Number(body.saleTaxPercent);
    if (body.withHoldingPercent !== undefined) data.withHoldingPercent = Number(body.withHoldingPercent);

    // Rows or a percent changed: the amounts are checked and the totals are worked out again
    const moneyChanged = ["quantity", "rate", "amount", "saleTaxPercent", "withHoldingPercent"].some((key) => body[key] !== undefined);
    if (moneyChanged) {
        const merged = {
            quantity: data.quantity ?? existingPurchaseOrder.quantity,
            rate: data.rate ?? existingPurchaseOrder.rate,
            amount: data.amount ?? existingPurchaseOrder.amount,
            saleTaxPercent: data.saleTaxPercent ?? existingPurchaseOrder.saleTaxPercent,
            withHoldingPercent: data.withHoldingPercent ?? existingPurchaseOrder.withHoldingPercent,
        };
        Object.assign(data, worthOf(merged));
    }

    const purchaseOrder = await prisma.purchaseOrder.update({
        where: { id: Number(id) },
        data
    });

    return res.status(200).json(new ApiResponse(200, purchaseOrder, "Purchase Order updated successfully"));
});

const deletePurchaseOrder = asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existingPurchaseOrder = await prisma.purchaseOrder.findUnique({ where: { id: Number(id) } });
    if (!existingPurchaseOrder) {
        throw new ApiError(404, "Purchase Order not found");
    }

    // An inward is made against the PO: the PO stays as long as it has one
    const inwards = await prisma.inward.count({ where: { purchaseOrderId: Number(id) } });
    if (inwards > 0) {
        throw new ApiError(400, `PO #${id} has ${inwards} inward record(s) and cannot be deleted`);
    }

    await prisma.purchaseOrder.delete({ where: { id: Number(id) } });

    return res.status(200).json(new ApiResponse(200, null, "Purchase Order deleted successfully"));
});

const getNextIdPurchaseOrder = asyncHandler(async (req, res) => {
    const { _max } = await prisma.purchaseOrder.aggregate({
        _max: { id: true }
    });
    const nextId = (_max.id || 0) + 1;

    console.log(
        `[PurchaseOrder] Next ID ${nextId} from ${getActiveDatabaseName().toUpperCase()} database`
    );

    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(
        new ApiResponse(200, { nextId }, "Next Purchase Order ID fetched successfully")
    );
});

const getPurchaseOrderBalanceReport = asyncHandler(async (req, res) => {
    const { vendorId, fromDate, toDate, itemName } = req.query;
    const paging = parsePaging(req.query);

    // Purchase orders are read page by page; the received qty is then loaded only for this page
    const where = {};
    const date = buildDateRange({ fromDate, toDate });
    if (date) where.date = date;
    const vendor = parseVendorId(vendorId);
    if (vendor) where.vendorId = vendor;
    if (itemName) where.itemName = { has: String(itemName) };

    const [total, purchaseOrders] = await Promise.all([
        prisma.purchaseOrder.count({ where }),
        prisma.purchaseOrder.findMany({
            where,
            include: { vendor: true },
            orderBy: { id: "asc" },
            skip: paging.skip,
            take: paging.limit,
        }),
    ]);

    const poIds = purchaseOrders.map((po) => po.id);
    const receivedItems = poIds.length
        ? await prisma.inwardItem.findMany({
            where: { inward: { purchaseOrderId: { in: poIds } } },
            select: {
                recQty: true,
                inventory: { select: { itemName: true } },
                inward: { select: { purchaseOrderId: true } },
            },
        })
        : [];

    // PO rows store the item name, inward rows are linked to Inventory: match on the item name
    const normalizeName = (name) => String(name || "").trim().toLowerCase();
    const receivedByPoAndItem = new Map();
    for (const item of receivedItems) {
        const key = `${item.inward.purchaseOrderId}::${normalizeName(item.inventory?.itemName)}`;
        receivedByPoAndItem.set(key, (receivedByPoAndItem.get(key) || 0) + (item.recQty || 0));
    }

    const report = [];
    for (const po of purchaseOrders) {
        if (!Array.isArray(po.itemName)) continue;

        // A PO can list the same item on several rows: add them up so the received qty is subtracted once
        const orderedByItem = new Map();
        po.itemName.forEach((name, i) => {
            const key = normalizeName(name);
            const entry = orderedByItem.get(key) || { itemName: name, orderedQty: 0 };
            entry.orderedQty += po.quantity?.[i] || 0;
            orderedByItem.set(key, entry);
        });

        for (const [key, entry] of orderedByItem) {
            if (itemName && key !== normalizeName(itemName)) continue;
            const receivedQty = receivedByPoAndItem.get(`${po.id}::${key}`) || 0;
            report.push({
                poId: po.id,
                date: po.date,
                vendorId: po.vendorId,
                vendorName: po.vendor?.vendorName || "Unknown Vendor",
                itemName: entry.itemName,
                orderedQty: entry.orderedQty,
                receivedQty,
                balanceQty: entry.orderedQty - receivedQty
            });
        }
    }

    return res.status(200).json({
        ...new ApiResponse(200, report, "Purchase Order balance report fetched successfully"),
        meta: pagingMeta(total, paging),
    });
});

// Purchase Order report. Without an item: one row per purchase order (date-wise / vendor-wise).
// With an item: one row per order line of that item. Read page by page like the other reports.
const getPurchaseOrderReport = asyncHandler(async (req, res) => {
    const { vendorId, fromDate, toDate, itemName, poId } = req.query;
    const paging = parsePaging(req.query);

    // ID-wise: the full report of one purchase order (every line + its totals)
    if (poId !== undefined && poId !== "") {
        const id = Number(poId);
        if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "PO No is not valid");
        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            include: { vendor: { select: { vendorName: true } } },
        });
        if (!po) throw new ApiError(404, `Purchase Order #${id} not found`);

        const vendorName = po.vendor?.vendorName || "Unknown Vendor";
        const worth = exactWorth(po);
        const lines = (po.itemName || []).map((name, index) => ({
            poId: po.id,
            date: po.date,
            vendorId: po.vendorId,
            vendorName,
            itemName: name,
            quantity: po.quantity?.[index] || 0,
            rate: po.rate?.[index] || 0,
            amount: po.amount?.[index] || 0,
        }));

        return res.status(200).json({
            ...new ApiResponse(200, lines, "Purchase Order report fetched successfully"),
            meta: {
                total: 1,
                page: 1,
                limit: lines.length || 1,
                totalPages: 1,
                lines: lines.length,
                totals: { total: po.total, grandTotal: worth.grandTotal },
                document: {
                    poId: po.id,
                    date: po.date,
                    vendorName,
                    validity: po.validity,
                    instruction: po.instruction,
                    quotationId: po.quotationId,
                    total: po.total,
                    saleTaxPercent: po.saleTaxPercent,
                    totalWithSaleTax: worth.totalWithSaleTax,
                    withHoldingPercent: po.withHoldingPercent,
                    withHoldingAmount: worth.withHoldingAmount,
                    grandTotal: worth.grandTotal,
                },
            },
        });
    }

    const where = {};
    const date = buildDateRange({ fromDate, toDate });
    if (date) where.date = date;
    const vendor = parseVendorId(vendorId);
    if (vendor) where.vendorId = vendor;
    const item = typeof itemName === "string" ? itemName.trim() : "";
    if (item) where.itemName = { has: item };

    const [total, sums, purchaseOrders] = await Promise.all([
        prisma.purchaseOrder.count({ where }),
        item ? Promise.resolve(null) : prisma.purchaseOrder.findMany({ where, select: { total: true, saleTaxPercent: true, withHoldingPercent: true } }),
        prisma.purchaseOrder.findMany({
            where,
            include: { vendor: { select: { vendorName: true } } },
            orderBy: { id: "asc" },
            skip: paging.skip,
            take: paging.limit,
        }),
    ]);

    const normalizeName = (name) => String(name || "").trim().toLowerCase();
    const rows = [];
    for (const po of purchaseOrders) {
        const vendorName = po.vendor?.vendorName || "Unknown Vendor";
        if (!item) {
            rows.push({
                poId: po.id,
                date: po.date,
                vendorId: po.vendorId,
                vendorName,
                validity: po.validity,
                itemsCount: Array.isArray(po.itemName) ? po.itemName.length : 0,
                total: po.total,
                saleTaxPercent: po.saleTaxPercent,
                grandTotal: exactWorth(po).grandTotal,
            });
            continue;
        }
        (po.itemName || []).forEach((name, index) => {
            if (normalizeName(name) !== normalizeName(item)) return;
            rows.push({
                poId: po.id,
                date: po.date,
                vendorId: po.vendorId,
                vendorName,
                itemName: name,
                quantity: po.quantity?.[index] || 0,
                rate: po.rate?.[index] || 0,
                amount: po.amount?.[index] || 0,
            });
        });
    }

    return res.status(200).json({
        ...new ApiResponse(200, rows, "Purchase Order report fetched successfully"),
        meta: {
            ...pagingMeta(total, paging),
            ...(sums
                ? {
                      totals: {
                          total: sums.reduce((sum, po) => sum + po.total, 0),
                          grandTotal: round2(sums.reduce((sum, po) => sum + exactWorth(po).grandTotal, 0)),
                      },
                  }
                : {}),
        },
    });
});

export default {
    getAllPurchaseOrders,
    getByIdPurchaseOrder,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    getNextIdPurchaseOrder,
    getPurchaseOrderBalanceReport,
    getPurchaseOrderReport
};
