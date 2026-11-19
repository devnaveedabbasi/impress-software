import { ApiError } from "../utils/apiError.js";
import { ApiResponse } from "../utils/apiResponse.js";
import asyncHandler from "../utils/asyncHandler.js";
import { parsePaging, pagingMeta, buildDateRange, parseVendorId } from "../utils/reportQuery.js";
import prisma, {
    getActiveDatabaseClient,
    getActiveDatabaseName,
} from "../config/prisma.js";
import { TX_OPTIONS } from "../services/stock.service.js";

// Vendor Bill Posting: the bill of the vendor for one inward. The lines are the inward items, the amount of a
// line is the OK quantity x the rate of the purchase order. The id of the bill is the Bill Posting No.
// A DRAFT (Pending) or REJECTED bill can be changed. An APPROVED (posted) bill is locked: only a Super Admin can change it.

import { isPagedRequest, findPage } from "../utils/listQuery.js";

const billInclude = {
    inward: {
        include: {
            purchaseOrder: { include: { vendor: { select: { id: true, vendorName: true } } } },
        },
    },
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

// "2026-03" from a date
const periodOf = (date) => {
    const d = new Date(date);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

// Money is shown exactly (to the paisa): 4% of 20 is 0.8, not 1. The amounts are whole rupees x a whole percent, so
// the tax never has more than two decimals; round2 only removes the float noise (0.1 + 0.2).
const round2 = (value) => Math.round(value * 100) / 100;
const exactTax = (exclAmount, saleTaxPercent) => round2((exclAmount * saleTaxPercent) / 100);

// The database keeps whole rupees for the tax and the total (its columns are whole numbers); what the screen and the
// reports show is always worked out exactly from the amount and the percent (see toResponse and buildLines).
const toStoredLine = (line) => ({ ...line, gstAmount: Math.round(line.gstAmount), inclAmount: Math.round(line.inclAmount) });
const toStoredTotals = (totals) => ({ ...totals, gstAmount: Math.round(totals.gstAmount), inclAmount: Math.round(totals.inclAmount) });

// The lines of the bill of an inward: OK qty x PO rate, with the sales tax. Only an inward against a PO has a rate.
// saleTaxPercent: the rate to use. When it is not given, it is the Sale Tax % of the PO of the inward (it was decided
// when the order was made, nobody types it again on the bill).
const buildLines = async (inwardId, givenSaleTaxPercent) => {
    const inward = await prisma.inward.findUnique({
        where: { id: inwardId },
        include: {
            purchaseOrder: { include: { vendor: { select: { id: true, vendorName: true } } } },
            items: { orderBy: { id: "asc" }, include: { inventory: { select: { id: true, itemName: true } } } },
        },
    });
    if (!inward) throw new ApiError(404, `Inward #${inwardId} not found`);
    if (inward.Type !== "againstPO" || !inward.purchaseOrder) {
        throw new ApiError(400, "Only an inward against a PO can be billed (the bill uses the rate of the PO)");
    }

    const po = inward.purchaseOrder;
    const saleTaxPercent = givenSaleTaxPercent ?? po.saleTaxPercent ?? 0;
    const lines = inward.items.map((item) => {
        const index = po.code.indexOf(item.inventoryId);
        if (index === -1) {
            throw new ApiError(400, `"${item.inventory?.itemName || item.inventoryId}" is not in PO #${po.id}`);
        }
        const rate = po.rate[index] || 0;
        const exclAmount = item.okQty * rate;
        const gstAmount = exactTax(exclAmount, saleTaxPercent);
        return {
            inventoryId: item.inventoryId,
            recQty: item.recQty,
            rejQty: item.rejQty,
            okQty: item.okQty,
            rate,
            exclAmount,
            gstAmount,
            inclAmount: round2(exclAmount + gstAmount),
        };
    });
    const totals = lines.reduce(
        (sum, line) => ({
            exclAmount: sum.exclAmount + line.exclAmount,
            gstAmount: round2(sum.gstAmount + line.gstAmount),
            inclAmount: round2(sum.inclAmount + line.inclAmount),
        }),
        { exclAmount: 0, gstAmount: 0, inclAmount: 0 }
    );
    return { inward, lines, totals, saleTaxPercent };
};

const toResponse = (bill) => {
    const inward = bill.inward;
    const lines = (bill.items || []).map((item) => {
        const gstAmount = exactTax(item.exclAmount, bill.saleTaxPercent);
        return { ...item, gstAmount, inclAmount: round2(item.exclAmount + gstAmount) };
    });
    const gstTotal = round2(lines.reduce((sum, line) => sum + line.gstAmount, 0));
    return {
        id: bill.id,
        inwardId: bill.inwardId,
        date: inward?.date,
        purchaseOrderId: inward?.purchaseOrderId ?? null,
        vendorId: inward?.purchaseOrder?.vendor?.id ?? null,
        vendorName: inward?.purchaseOrder?.vendor?.vendorName ?? "",
        grirNo: inward?.GRIRNo,
        dcNo: inward?.DCNo,
        type: inward?.Type,
        billNo: bill.billNo,
        stInvNo: bill.stInvNo,
        stInvDate: bill.stInvDate,
        saleTaxPercent: bill.saleTaxPercent,
        period: bill.period,
        status: bill.status,
        approvedDate: bill.approvedDate,
        exclAmount: bill.exclAmount,
        gstAmount: gstTotal,
        inclAmount: round2(bill.exclAmount + gstTotal),
        items: lines.map((item) => ({
            inventoryId: item.inventoryId,
            itemName: item.inventory?.itemName || "",
            recQty: item.recQty,
            rejQty: item.rejQty,
            okQty: item.okQty,
            rate: item.rate,
            exclAmount: item.exclAmount,
            gstAmount: item.gstAmount,
            inclAmount: item.inclAmount,
        })),
    };
};

const getAllVendorBills = asyncHandler(async (req, res) => {
    if (isPagedRequest(req)) {
        const page = await findPage(prisma.vendorBill, req, {
            searchFields: ["billNo", "stInvNo"],
            numberFields: ["inwardId"],
            nestedFields: [
                ["inward", "purchaseOrder", "vendor", "vendorName"],
                ["items", "some", "inventory", "itemName"],
            ],
            dateFields: ["stInvDate"],
            include: billInclude,
            after: async (bills) => bills.map(toResponse),
        });
        return res.status(200).json(new ApiResponse(200, page, "Vendor bills fetched successfully"));
    }
    const bills = await prisma.vendorBill.findMany({ include: billInclude, orderBy: { id: "asc" } });
    return res.status(200).json(new ApiResponse(200, bills.map(toResponse), "Vendor bills fetched successfully"));
});

const getByIdVendorBill = asyncHandler(async (req, res) => {
    const bill = await prisma.vendorBill.findUnique({ where: { id: Number(req.params.id) }, include: billInclude });
    if (!bill) throw new ApiError(404, "Vendor bill not found");
    return res.status(200).json(new ApiResponse(200, toResponse(bill), "Vendor bill fetched successfully"));
});

const getNextIdVendorBill = asyncHandler(async (req, res) => {
    const { _max } = await prisma.vendorBill.aggregate({ _max: { id: true } });
    res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    return res.status(200).json(new ApiResponse(200, { nextId: (_max.id || 0) + 1 }, "Next Bill Posting No fetched successfully"));
});

// The inwards that can still get a bill (against a PO, no bill yet), for the "QC #" picker
const getBillableInwards = asyncHandler(async (req, res) => {
    if (isPagedRequest(req)) {
        const page = await findPage(prisma.inward, req, {
            baseWhere: { Type: "againstPO", purchaseOrderId: { not: null }, vendorBill: { is: null } },
            numberFields: ["GRIRNo", "DCNo", "purchaseOrderId"],
            nestedFields: [["purchaseOrder", "vendor", "vendorName"]],
            dateFields: ["date"],
            include: { purchaseOrder: { include: { vendor: { select: { vendorName: true } } } } },
            after: async (inwards) =>
                inwards.map((inward) => ({
                    id: inward.id,
                    date: inward.date,
                    purchaseOrderId: inward.purchaseOrderId,
                    vendorName: inward.purchaseOrder?.vendor?.vendorName || "",
                    grirNo: inward.GRIRNo,
                    dcNo: inward.DCNo,
                })),
        });
        return res.status(200).json(new ApiResponse(200, page, "Inwards fetched successfully"));
    }
    const inwards = await prisma.inward.findMany({
        where: { Type: "againstPO", purchaseOrderId: { not: null }, vendorBill: { is: null } },
        orderBy: { id: "asc" },
        include: { purchaseOrder: { include: { vendor: { select: { vendorName: true } } } } },
    });
    const rows = inwards.map((inward) => ({
        id: inward.id,
        date: inward.date,
        purchaseOrderId: inward.purchaseOrderId,
        vendorName: inward.purchaseOrder?.vendor?.vendorName || "",
        grirNo: inward.GRIRNo,
        dcNo: inward.DCNo,
    }));
    return res.status(200).json(new ApiResponse(200, rows, "Inwards fetched successfully"));
});

// The lines of an inward with the PO rate, before the bill is saved
const previewVendorBill = asyncHandler(async (req, res) => {
    const inwardId = Number(req.query.inwardId);
    const existing = await prisma.vendorBill.findUnique({ where: { inwardId }, select: { id: true } });
    if (existing) throw new ApiError(409, `Inward #${inwardId} already has bill #${existing.id}`);

    const { inward, lines, totals, saleTaxPercent } = await buildLines(inwardId);
    const names = new Map(inward.items.map((item) => [item.inventoryId, item.inventory?.itemName || ""]));
    return res.status(200).json(
        new ApiResponse(
            200,
            {
                inwardId: inward.id,
                date: inward.date,
                purchaseOrderId: inward.purchaseOrderId,
                vendorId: inward.purchaseOrder.vendor.id,
                vendorName: inward.purchaseOrder.vendor.vendorName,
                grirNo: inward.GRIRNo,
                dcNo: inward.DCNo,
                type: inward.Type,
                saleTaxPercent,
                items: lines.map((line) => ({ ...line, itemName: names.get(line.inventoryId) || "" })),
                ...totals,
            },
            "Bill preview fetched successfully"
        )
    );
});

const createVendorBill = asyncHandler(async (req, res) => {
    const { inwardId, stInvNo, stInvDate } = req.body;

    console.log(
        `[VendorBill] Creating bill for inward ${inwardId} in ${getActiveDatabaseName().toUpperCase()} database`
    );

    const existing = await prisma.vendorBill.findUnique({ where: { inwardId: Number(inwardId) }, select: { id: true } });
    if (existing) throw new ApiError(409, `Inward #${inwardId} already has bill #${existing.id}`);

    // the Sale Tax % is the one of the PO; what the form sends for it is not used
    const { lines, totals, saleTaxPercent } = await buildLines(Number(inwardId));

    await syncSequence("VendorBill");
    await syncSequence("VendorBillItem");

    // The Bill # is the id of the bill itself, so it is written right after the bill gets its id
    const bill = await getActiveDatabaseClient().$transaction(async (tx) => {
        const created = await tx.vendorBill.create({
            data: {
                inwardId: Number(inwardId),
                billNo: "",
                stInvNo,
                stInvDate: new Date(stInvDate),
                saleTaxPercent,
                period: periodOf(stInvDate),
                ...toStoredTotals(totals),
                createdById: req.user?.id,
                items: { create: lines.map(toStoredLine) },
            },
        });
        await tx.vendorBill.update({ where: { id: created.id }, data: { billNo: String(created.id) } });
        return tx.vendorBill.findUnique({ where: { id: created.id }, include: billInclude });
    }, TX_OPTIONS);

    return res.status(201).json(new ApiResponse(201, toResponse(bill), "Vendor bill saved successfully"));
});

// An approved (posted) bill is locked: only a Super Admin can change or delete it
const assertEditable = (bill, user) => {
    if (bill.status === "APPROVED" && !user?.isSuperAdmin) {
        throw new ApiError(403, `Bill #${bill.id} is approved (posted). Only a Super Admin can change it.`);
    }
};

const updateVendorBill = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const { stInvNo, stInvDate } = req.body;

    const existing = await prisma.vendorBill.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Vendor bill not found");
    assertEditable(existing, req.user);

    // The status chosen by the user. Approved posts the bill: the date of the approval is today.
    const status = req.body.status ?? existing.status;
    const approving = status === "APPROVED";

    // The lines are taken again from the inward and the PO
    // the Sale Tax % of the bill stays as it was saved (it came from the PO)
    const { lines, totals } = await buildLines(existing.inwardId, existing.saleTaxPercent);

    await syncSequence("VendorBillItem");
    const bill = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.vendorBillItem.deleteMany({ where: { vendorBillId: id } });
        await tx.vendorBill.update({
            where: { id },
            data: {
                stInvNo,
                stInvDate: new Date(stInvDate),
                period: periodOf(stInvDate),
                ...toStoredTotals(totals),
                status,
                // A bill that stays approved keeps the date (and the person) of its approval
                approvedDate: approving ? (existing.status === "APPROVED" ? existing.approvedDate : new Date()) : null,
                approvedById: approving ? (existing.status === "APPROVED" ? existing.approvedById : req.user?.id) : null,
                updatedById: req.user?.id,
                items: { create: lines.map(toStoredLine) },
            },
        });
        return tx.vendorBill.findUnique({ where: { id }, include: billInclude });
    }, TX_OPTIONS);

    return res
        .status(200)
        .json(new ApiResponse(200, toResponse(bill), approving ? "Vendor bill approved successfully" : "Vendor bill updated successfully"));
});

// Approve = post the bill. The lines are taken once more from the inward and the PO, then the bill is locked.
const approveVendorBill = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.vendorBill.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Vendor bill not found");
    if (existing.status === "APPROVED") throw new ApiError(400, `Bill #${id} is already approved`);

    const { lines, totals } = await buildLines(existing.inwardId, existing.saleTaxPercent);

    await syncSequence("VendorBillItem");
    const bill = await getActiveDatabaseClient().$transaction(async (tx) => {
        await tx.vendorBillItem.deleteMany({ where: { vendorBillId: id } });
        await tx.vendorBill.update({
            where: { id },
            data: {
                ...toStoredTotals(totals),
                status: "APPROVED",
                approvedDate: new Date(),
                approvedById: req.user?.id,
                updatedById: req.user?.id,
                items: { create: lines.map(toStoredLine) },
            },
        });
        return tx.vendorBill.findUnique({ where: { id }, include: billInclude });
    }, TX_OPTIONS);

    return res.status(200).json(new ApiResponse(200, toResponse(bill), "Vendor bill approved successfully"));
});

const deleteVendorBill = asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    const existing = await prisma.vendorBill.findUnique({ where: { id } });
    if (!existing) throw new ApiError(404, "Vendor bill not found");
    assertEditable(existing, req.user);

    await prisma.vendorBill.delete({ where: { id } });
    return res.status(200).json(new ApiResponse(200, null, "Vendor bill deleted successfully"));
});

// Vendor Bill Pending Report: the inwards against a PO whose bill is not posted yet (no bill, pending or rejected)
const getPendingReport = asyncHandler(async (req, res) => {
    const paging = parsePaging(req.query);
    const where = {
        Type: "againstPO",
        purchaseOrderId: { not: null },
        // Pending = no bill yet, a pending bill or a rejected bill (only an approved bill is posted)
        OR: [{ vendorBill: { is: null } }, { vendorBill: { status: { in: ["DRAFT", "REJECTED"] } } }],
    };
    const date = buildDateRange({ fromDate: req.query.fromDate, toDate: req.query.toDate });
    if (date) where.date = date;
    const vendorId = parseVendorId(req.query.vendorId);
    if (vendorId) where.purchaseOrder = { vendorId };

    const [total, inwards] = await Promise.all([
        prisma.inward.count({ where }),
        prisma.inward.findMany({
            where,
            skip: paging.skip,
            take: paging.limit,
            include: {
                purchaseOrder: { include: { vendor: { select: { id: true, vendorName: true } } } },
                vendorBill: { select: { id: true, status: true } },
            },
        }),
    ]);

    const rows = inwards
        .map((inward) => ({
            id: inward.id,
            vendorId: inward.purchaseOrder?.vendor?.id ?? null,
            vendorName: inward.purchaseOrder?.vendor?.vendorName || "Unknown Vendor",
            date: inward.date,
            purchaseOrderId: inward.purchaseOrderId,
            grirNo: inward.GRIRNo,
            dcNo: inward.DCNo,
            billNo: inward.billNO,
            billStatus: !inward.vendorBill ? "No bill" : inward.vendorBill.status === "REJECTED" ? "Rejected" : "Pending",
        }))
        .sort((a, b) => a.vendorName.localeCompare(b.vendorName) || new Date(a.date) - new Date(b.date) || a.id - b.id);

    return res.status(200).json({
        ...new ApiResponse(200, rows, "Vendor bill pending report fetched successfully"),
        meta: { ...pagingMeta(total, paging), totals: { inwards: total } },
    });
});

export default {
    getAllVendorBills,
    getByIdVendorBill,
    getNextIdVendorBill,
    getBillableInwards,
    previewVendorBill,
    createVendorBill,
    updateVendorBill,
    approveVendorBill,
    deleteVendorBill,
    getPendingReport,
};
