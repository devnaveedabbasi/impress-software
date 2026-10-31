import { z } from "zod";

export const inwardIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

const rowDataBody = {
    code: z.array(z.coerce.number().min(1, "Code cannot be empty")).min(1, "At least one code is required"),
    itemName: z.array(z.string().min(1, "Item name cannot be empty")).min(1, "At least one item name is required"),
    poBalQty: z.array(z.coerce.number().min(0, "PO Bal Qty cannot be negative")).min(1, "At least one PO Bal Qty is required"),
    recQty: z.array(z.coerce.number().min(0, "Rec Qty cannot be negative")).min(1, "At least one Rec Qty is required"),
    rejQty: z.array(z.coerce.number().min(0, "REJ Qty cannot be negative")).min(1, "At least one REJ Qty is required"),
    okQty: z.array(z.coerce.number().min(0, "Ok Qty cannot be negative")).min(1, "At least one Ok Qty is required"),
    packingDetail: z.array(z.string().optional()).min(1, "At least one Packing Detail is required"),
};

export const createInwardSchema = z.object({
    body: z.object({
        date: z.string().min(1, "Date is required"),
        Type: z.enum(["againstSimple", "againstPO", "againstDealarRejection"]),
        purchaseOrderId: z.coerce.number().optional(),
        quotationId: z.coerce.number().optional(),
        GRIRNo: z.coerce.number().min(1, "GRIRNo is required"),
        DCNo: z.coerce.number().min(1, "DCNo is required"),
        billNO: z.coerce.number().optional(),
        detail: z.string().min(1, "Detail is required"),
        ...rowDataBody
    }).refine((data) => {
        const lengths = [
            data.code.length,
            data.itemName.length,
            data.poBalQty.length,
            data.recQty.length,
            data.rejQty.length,
            data.okQty.length,
            data.packingDetail.length
        ];
        return lengths.every(val => val === lengths[0]);
    }, {
        message: "All array fields (code, itemName, poBalQty, recQty, rejQty, okQty, packingDetail) must have the same length",
        path: ["arrays"]
    })
});

export const updateInwardSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: z.string().optional(),
        Type: z.enum(["againstSimple", "againstPO", "againstDealarRejection"]).optional(),
        purchaseOrderId: z.coerce.number().optional(),
        quotationId: z.coerce.number().optional(),
        GRIRNo: z.coerce.number().optional(),
        DCNo: z.coerce.number().optional(),
        billNO: z.coerce.number().optional(),
        detail: z.string().optional(),
        code: z.array(z.coerce.number().min(1, "Code cannot be empty")).optional(),
        itemName: z.array(z.string().min(1, "Item name cannot be empty")).optional(),
        poBalQty: z.array(z.coerce.number().min(0, "PO Bal Qty cannot be negative")).optional(),
        recQty: z.array(z.coerce.number().min(0, "Rec Qty cannot be negative")).optional(),
        rejQty: z.array(z.coerce.number().min(0, "REJ Qty cannot be negative")).optional(),
        okQty: z.array(z.coerce.number().min(0, "Ok Qty cannot be negative")).optional(),
        packingDetail: z.array(z.string().optional()).optional(),
    }).refine((data) => {
        const arrays = [
            data.code,
            data.itemName,
            data.poBalQty,
            data.recQty,
            data.rejQty,
            data.okQty,
            data.packingDetail
        ].filter(arr => arr !== undefined);

        if (arrays.length > 0) {
            const length = arrays[0].length;
            return arrays.every(arr => arr.length === length);
        }
        return true;
    }, {
        message: "If provided, all array fields must have the same length",
        path: ["arrays"]
    })
});

export const inwardByDateSchema = z.object({
    query: z.object({
        fromDate: z.string().min(1, "fromDate is required").max(20, "fromDate string is too long"),
        toDate: z.string().min(1, "toDate is required").max(20, "toDate string is too long"),
    }),
});
