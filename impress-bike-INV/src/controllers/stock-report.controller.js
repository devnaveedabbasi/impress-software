import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";
import { parsePaging, pagingMeta, buildDateRange } from "../utils/reportQuery.js";
import { SOURCE_LABELS, getStockInHand } from "../services/stock.service.js";

// Store reports: Stock Register, Stock Ledger (all items), Shortage and Issue report.
// Every report is read page by page, the filters are applied by the database.

const MAX_BIKES = 100000;

const optionalId = (value, label) => {
    if (value === undefined || value === "" || value === "all") return undefined;
    const id = Number(value);
    if (!Number.isInteger(id) || id < 1) throw new ApiError(400, `${label} is not valid`);
    return id;
};

const text = (value) => (typeof value === "string" ? value.trim() : "");

const sendReport = (res, message, rows, paging, total, extra = {}) =>
    res.status(200).json({
        ...new ApiResponse(200, rows, message),
        meta: { ...pagingMeta(total, paging), ...extra },
    });

// The inventory items of a report: filtered by category, department and a part of the item name
const inventoryWhere = (query) => {
    const where = {};
    const categoryId = optionalId(query.categoryId, "Category");
    const departmentId = optionalId(query.departmentId, "Department");
    if (categoryId) where.categoryId = categoryId;
    if (departmentId) where.departmentId = departmentId;
    const name = text(query.itemName);
    if (name) where.itemName = { contains: name, mode: "insensitive" };
    return where;
};

const inventorySelect = {
    id: true,
    itemName: true,
    unitPerBike: true,
    category: { select: { name: true } },
    department: { select: { name: true } },
};

// ---------- Stock Register: opening, in, out and closing of every item ----------
//   opening = inventory master stock + movements before the "from" date
//   closing = opening + in - out
const getStockRegister = asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const range = buildDateRange({ fromDate: req.query.fromDate, toDate: req.query.toDate });
    const status = ["inStock", "zero"].includes(req.query.status) ? req.query.status : "all";

    const items = await prisma.inventory.findMany({
        where: inventoryWhere(req.query),
        select: inventorySelect,
        orderBy: { itemName: "asc" },
    });
    const ids = items.map((item) => item.id);

    const [master, before, inRange, outRange] = await Promise.all([
        prisma.inventoryStock.groupBy({ by: ["inventoryId"], where: { inventoryId: { in: ids } }, _sum: { qty: true } }),
        range?.gte
            ? prisma.stockMovement.groupBy({ by: ["inventoryId"], where: { inventoryId: { in: ids }, date: { lt: range.gte } }, _sum: { qty: true } })
            : Promise.resolve([]),
        prisma.stockMovement.groupBy({
            by: ["inventoryId"],
            where: { inventoryId: { in: ids }, qty: { gt: 0 }, ...(range ? { date: range } : {}) },
            _sum: { qty: true },
        }),
        prisma.stockMovement.groupBy({
            by: ["inventoryId"],
            where: { inventoryId: { in: ids }, qty: { lt: 0 }, ...(range ? { date: range } : {}) },
            _sum: { qty: true },
        }),
    ]);

    const toMap = (rows) => new Map(rows.map((row) => [row.inventoryId, row._sum.qty || 0]));
    const masterMap = toMap(master);
    const beforeMap = toMap(before);
    const inMap = toMap(inRange);
    const outMap = toMap(outRange);

    let rows = items.map((item) => {
        const opening = (masterMap.get(item.id) || 0) + (beforeMap.get(item.id) || 0);
        const qtyIn = inMap.get(item.id) || 0;
        const qtyOut = -(outMap.get(item.id) || 0);
        return {
            inventoryId: item.id,
            itemName: item.itemName,
            categoryName: item.category?.name || "-",
            departmentName: item.department?.name || "-",
            opening,
            qtyIn,
            qtyOut,
            closing: opening + qtyIn - qtyOut,
        };
    });
    if (status === "inStock") rows = rows.filter((row) => row.closing > 0);
    if (status === "zero") rows = rows.filter((row) => row.closing <= 0);

    const totals = rows.reduce(
        (sum, row) => ({
            opening: sum.opening + row.opening,
            qtyIn: sum.qtyIn + row.qtyIn,
            qtyOut: sum.qtyOut + row.qtyOut,
            closing: sum.closing + row.closing,
        }),
        { opening: 0, qtyIn: 0, qtyOut: 0, closing: 0 }
    );

    return sendReport(res, "Stock register fetched successfully", rows.slice(paging.skip, paging.skip + paging.limit), paging, rows.length, { totals });
});

// ---------- Store Stock Position (the Stock Ledger report): one line per item, grouped by department / category ----------
//   Opening   = inventory master stock + movements before the "from" date
//   Inward    = inward (OK qty) + the new item of a transfer
//   Issue     = store issuance - item return + the old items of a transfer
//   Aftersale = sale gate pass
//   Vendor Reject = quantity sent back to vendors (information only, a rejected quantity never entered the stock)
//   Stock In Hand = Opening + Inward - Issue - Aftersale
const getStockPosition = asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const range = buildDateRange({ fromDate: req.query.fromDate, toDate: req.query.toDate });

    const items = await prisma.inventory.findMany({
        where: inventoryWhere(req.query),
        select: inventorySelect,
    });
    const ids = items.map((item) => item.id);
    const dateFilter = range ? { date: range } : {};

    const [master, before, positive, negative, vendorRejects] = await Promise.all([
        prisma.inventoryStock.groupBy({ by: ["inventoryId"], where: { inventoryId: { in: ids } }, _sum: { qty: true } }),
        range?.gte
            ? prisma.stockMovement.groupBy({ by: ["inventoryId"], where: { inventoryId: { in: ids }, date: { lt: range.gte } }, _sum: { qty: true } })
            : Promise.resolve([]),
        prisma.stockMovement.groupBy({
            by: ["inventoryId", "sourceType"],
            where: { inventoryId: { in: ids }, qty: { gt: 0 }, ...dateFilter },
            _sum: { qty: true },
        }),
        prisma.stockMovement.groupBy({
            by: ["inventoryId", "sourceType"],
            where: { inventoryId: { in: ids }, qty: { lt: 0 }, ...dateFilter },
            _sum: { qty: true },
        }),
        prisma.rejectionReturnItem.groupBy({
            by: ["inventoryId"],
            where: { inventoryId: { in: ids }, ...(range ? { rejectionReturn: { date: range } } : {}) },
            _sum: { rej: true },
        }),
    ]);

    const masterMap = new Map(master.map((row) => [row.inventoryId, row._sum.qty || 0]));
    const beforeMap = new Map(before.map((row) => [row.inventoryId, row._sum.qty || 0]));
    const rejectMap = new Map(vendorRejects.map((row) => [row.inventoryId, row._sum.rej || 0]));

    // Every movement goes to one column. A transfer and an unknown document go by their sign.
    const columns = new Map(); // inventoryId -> { inward, issue, aftersale }
    const add = (inventoryId, column, amount) => {
        const entry = columns.get(inventoryId) || { inward: 0, issue: 0, aftersale: 0 };
        entry[column] += amount;
        columns.set(inventoryId, entry);
    };
    const classify = (sourceType, sign) => {
        if (sourceType === "INWARD") return ["inward", 1];
        if (sourceType === "SALE_GATE_PASS") return ["aftersale", -1];
        if (sourceType === "STORE_ISSUE" || sourceType === "ITEM_RETURN") return ["issue", -1];
        return sign > 0 ? ["inward", 1] : ["issue", -1];
    };
    for (const row of positive) {
        const [column, factor] = classify(row.sourceType, 1);
        add(row.inventoryId, column, factor * (row._sum.qty || 0));
    }
    for (const row of negative) {
        const [column, factor] = classify(row.sourceType, -1);
        add(row.inventoryId, column, factor * (row._sum.qty || 0));
    }

    const rows = items
        .map((item) => {
            const opening = (masterMap.get(item.id) || 0) + (beforeMap.get(item.id) || 0);
            const { inward = 0, issue = 0, aftersale = 0 } = columns.get(item.id) || {};
            return {
                inventoryId: item.id,
                itemName: item.itemName,
                categoryName: item.category?.name || "-",
                departmentName: item.department?.name || "-",
                unitPerBike: item.unitPerBike,
                opening,
                inward,
                issue,
                aftersale,
                vendorReject: rejectMap.get(item.id) || 0,
                stock: opening + inward - issue - aftersale,
            };
        })
        // An item with nothing at all (no stock, no movement) is not part of the position
        .filter((row) => row.opening || row.inward || row.issue || row.aftersale || row.vendorReject || row.stock)
        .sort(
            (a, b) =>
                a.departmentName.localeCompare(b.departmentName) ||
                a.categoryName.localeCompare(b.categoryName) ||
                a.itemName.localeCompare(b.itemName)
        );

    const totals = rows.reduce(
        (sum, row) => ({
            opening: sum.opening + row.opening,
            inward: sum.inward + row.inward,
            issue: sum.issue + row.issue,
            aftersale: sum.aftersale + row.aftersale,
            vendorReject: sum.vendorReject + row.vendorReject,
            stock: sum.stock + row.stock,
        }),
        { opening: 0, inward: 0, issue: 0, aftersale: 0, vendorReject: 0, stock: 0 }
    );

    return sendReport(res, "Store stock position fetched successfully", rows.slice(paging.skip, paging.skip + paging.limit), paging, rows.length, { totals });
});

// ---------- Stock Ledger: every stock movement of all items (or of one item) ----------
const getStockMovements = asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const range = buildDateRange({ fromDate: req.query.fromDate, toDate: req.query.toDate });
    const inventoryId = optionalId(req.query.inventoryId, "Item");
    const sourceType = text(req.query.sourceType);
    if (sourceType && !SOURCE_LABELS[sourceType]) throw new ApiError(400, "Document type is not valid");

    const where = {
        ...(range ? { date: range } : {}),
        ...(inventoryId ? { inventoryId } : {}),
        ...(sourceType ? { sourceType } : {}),
    };

    const [total, qtyIn, qtyOut, movements] = await Promise.all([
        prisma.stockMovement.count({ where }),
        prisma.stockMovement.aggregate({ where: { ...where, qty: { gt: 0 } }, _sum: { qty: true } }),
        prisma.stockMovement.aggregate({ where: { ...where, qty: { lt: 0 } }, _sum: { qty: true } }),
        prisma.stockMovement.findMany({
            where,
            skip: paging.skip,
            take: paging.limit,
            orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
            include: { inventory: { select: { itemName: true } } },
        }),
    ]);

    const rows = movements.map((movement) => ({
        id: movement.id,
        date: movement.date,
        inventoryId: movement.inventoryId,
        itemName: movement.inventory?.itemName || "",
        sourceLabel: SOURCE_LABELS[movement.sourceType] || movement.sourceType,
        sourceId: movement.sourceId,
        note: movement.note,
        qtyIn: movement.qty > 0 ? movement.qty : 0,
        qtyOut: movement.qty < 0 ? -movement.qty : 0,
    }));

    return sendReport(res, "Stock ledger fetched successfully", rows, paging, total, {
        totals: { qtyIn: qtyIn._sum.qty || 0, qtyOut: -(qtyOut._sum.qty || 0) },
    });
});

// ---------- Shortage: what is missing to build the given number of bikes ----------
//   Require   = bikes x Unit Per Bike
//   After Bal = In Hand - Require (a negative balance is a shortage)
// An item whose stock is already negative is a shortage even when no bike needs it.
const getShortageReport = asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const bikes = Number(req.query.bikes);
    if (!Number.isInteger(bikes) || bikes < 1 || bikes > MAX_BIKES) {
        throw new ApiError(400, `Bikes to build must be a whole number from 1 to ${MAX_BIKES.toLocaleString()}`);
    }
    const showAll = req.query.show === "all";

    const items = await prisma.inventory.findMany({
        where: inventoryWhere(req.query),
        select: inventorySelect,
    });
    const stock = await getStockInHand(items.map((item) => item.id));

    let rows = items.map((item) => {
        const required = bikes * item.unitPerBike;
        const inHand = stock.get(item.id) ?? 0;
        return {
            inventoryId: item.id,
            itemName: item.itemName,
            categoryName: item.category?.name || "-",
            departmentName: item.department?.name || "-",
            unitPerBike: item.unitPerBike,
            required,
            inHand,
            afterBal: inHand - required,
        };
    });
    const shortItems = rows.filter((row) => row.afterBal < 0);
    const totals = {
        items: rows.length,
        shortItems: shortItems.length,
        shortQty: shortItems.reduce((sum, row) => sum - row.afterBal, 0),
    };
    if (!showAll) rows = shortItems;
    rows.sort((a, b) => a.departmentName.localeCompare(b.departmentName) || a.inventoryId - b.inventoryId);

    return sendReport(res, "Shortage report fetched successfully", rows.slice(paging.skip, paging.skip + paging.limit), paging, rows.length, { totals });
});

// ---------- Issue report: the item lines of the Store Issuance slips ----------
const getIssueReport = asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const range = buildDateRange({ fromDate: req.query.fromDate, toDate: req.query.toDate });
    const departmentId = optionalId(req.query.departmentId, "Department");
    const colorId = optionalId(req.query.colorId, "Color");
    const inventoryId = optionalId(req.query.inventoryId, "Item");

    const where = {
        ...(inventoryId ? { inventoryId } : {}),
        storeIssue: {
            ...(range ? { date: range } : {}),
            ...(departmentId ? { departmentId } : {}),
            ...(colorId ? { colorId } : {}),
        },
    };

    const [total, sums, lines] = await Promise.all([
        prisma.storeIssueItem.count({ where }),
        prisma.storeIssueItem.aggregate({ where, _sum: { issueQty: true } }),
        prisma.storeIssueItem.findMany({
            where,
            skip: paging.skip,
            take: paging.limit,
            orderBy: [{ storeIssue: { date: "asc" } }, { storeIssueId: "asc" }, { id: "asc" }],
            include: {
                inventory: { select: { itemName: true } },
                storeIssue: {
                    select: {
                        id: true,
                        date: true,
                        bikeQty: true,
                        department: { select: { name: true } },
                        color: { select: { name: true } },
                    },
                },
            },
        }),
    ]);

    const rows = lines.map((line) => ({
        id: line.id,
        slipNo: line.storeIssue.id,
        date: line.storeIssue.date,
        departmentName: line.storeIssue.department?.name || "-",
        colorName: line.storeIssue.color?.name || "-",
        bikeQty: line.storeIssue.bikeQty,
        inventoryId: line.inventoryId,
        itemName: line.inventory?.itemName || "",
        upm: line.upm,
        issueQty: line.issueQty,
        purpose: line.purpose,
    }));

    return sendReport(res, "Issue report fetched successfully", rows, paging, total, {
        totals: { issueQty: sums._sum.issueQty || 0 },
    });
});

export default { getStockRegister, getStockPosition, getStockMovements, getShortageReport, getIssueReport };
