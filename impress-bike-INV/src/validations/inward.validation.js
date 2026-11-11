import { z } from "zod";

export const inwardIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

// Each row must be linked to an Inventory item (inventoryId)
const inwardItemSchema = z
    .object({
        inventoryId: z.coerce
            .number({ error: "Please select an item from inventory" })
            .int()
            .min(1, "Please select an item from inventory"),
        poBalQty: z.coerce.number().int().min(0, "PO Bal Qty cannot be negative").default(0),
        recQty: z.coerce.number().int().min(1, "Rec Qty must be at least 1"),
        rejQty: z.coerce.number().int().min(0, "REJ Qty cannot be negative").default(0),
        okQty: z.coerce.number().int().min(0, "OK Qty cannot be negative").optional(),
        packingDetail: z.string().max(255).optional().default(""),
    })
    .refine((row) => row.rejQty <= row.recQty, {
        message: "REJ Qty cannot be greater than Rec Qty",
        path: ["rejQty"],
    })
    .refine((row) => !(row.poBalQty > 0) || row.recQty <= row.poBalQty, {
        message: "Rec Qty cannot be more than PO Bal Qty",
        path: ["recQty"],
    });

const itemsSchema = z
    .array(inwardItemSchema)
    .min(1, "At least one item row is required")
    .refine(
        (items) => new Set(items.map((item) => item.inventoryId)).size === items.length,
        { message: "The same inventory item cannot be added twice" }
    );

const headerFields = {
    date: z.string().min(1, "Date is required"),
    Type: z.enum(["againstSimple", "againstPO", "againstDealarRejection"]),
    purchaseOrderId: z.coerce.number().nullable().optional(),
    quotationId: z.coerce.number().nullable().optional(),
    GRIRNo: z.coerce.number().min(1, "GRIRNo is required"),
    DCNo: z.coerce.number().min(1, "DCNo is required"),
    billNO: z.coerce.number().nullable().optional(),
    detail: z.string().trim().min(3, "Detail must be at least 3 characters").max(255, "Detail must be at most 255 characters"),
};

export const createInwardSchema = z.object({
    body: z.object({
        ...headerFields,
        items: itemsSchema,
    }),
});

export const updateInwardSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: headerFields.date.optional(),
        Type: headerFields.Type.optional(),
        purchaseOrderId: headerFields.purchaseOrderId,
        quotationId: headerFields.quotationId,
        GRIRNo: headerFields.GRIRNo.optional(),
        DCNo: headerFields.DCNo.optional(),
        billNO: headerFields.billNO,
        detail: headerFields.detail.optional(),
        items: itemsSchema.optional(),
    }),
});

export const inwardByDateSchema = z.object({
    query: z.object({
        fromDate: z.string().min(1, "fromDate is required").max(20, "fromDate string is too long"),
        toDate: z.string().min(1, "toDate is required").max(20, "toDate string is too long"),
    }),
});
