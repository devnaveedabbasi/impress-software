import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import prisma from "../config/prisma.js";
import { parsePaging, pagingMeta, buildDateRange } from "../utils/reportQuery.js";
import { SOURCE_LABELS } from "../services/stock.service.js";

// Item Ledger: every stock movement of one item with a running balance.
//   opening = inventory master stock + movements before the "from" date
//   balance = opening + the movements up to that line
const getItemLedger = asyncHandler(async (req, res) => {
    const inventoryId = Number(req.query.inventoryId);
    if (!Number.isInteger(inventoryId) || inventoryId < 1) {
        throw new ApiError(400, "Please select an item");
    }

    const item = await prisma.inventory.findUnique({ where: { id: inventoryId }, select: { id: true, itemName: true } });
    if (!item) {
        throw new ApiError(404, "Item not found");
    }

    const paging = parsePaging(req.query);
    const range = buildDateRange({ fromDate: req.query.fromDate, toDate: req.query.toDate });

    const [master, before, movements] = await Promise.all([
        prisma.inventoryStock.aggregate({ where: { inventoryId }, _sum: { qty: true } }),
        range?.gte
            ? prisma.stockMovement.aggregate({ where: { inventoryId, date: { lt: range.gte } }, _sum: { qty: true } })
            : Promise.resolve(null),
        prisma.stockMovement.findMany({
            where: { inventoryId, ...(range ? { date: range } : {}) },
            orderBy: [{ date: "asc" }, { createdAt: "asc" }, { id: "asc" }],
        }),
    ]);

    const opening = (master._sum.qty || 0) + (before?._sum.qty || 0);

    let balance = opening;
    let qtyIn = 0;
    let qtyOut = 0;
    const lines = movements.map((movement) => {
        balance += movement.qty;
        if (movement.qty > 0) qtyIn += movement.qty;
        else qtyOut += -movement.qty;
        return {
            id: movement.id,
            date: movement.date,
            sourceType: movement.sourceType,
            sourceLabel: SOURCE_LABELS[movement.sourceType] || movement.sourceType,
            sourceId: movement.sourceId,
            note: movement.note,
            qtyIn: movement.qty > 0 ? movement.qty : 0,
            qtyOut: movement.qty < 0 ? -movement.qty : 0,
            balance,
        };
    });

    return res.status(200).json({
        ...new ApiResponse(200, lines.slice(paging.skip, paging.skip + paging.limit), "Item ledger fetched successfully"),
        meta: {
            ...pagingMeta(lines.length, paging),
            item,
            opening,
            closing: balance,
            totals: { qtyIn, qtyOut },
        },
    });
});

export default { getItemLedger };
