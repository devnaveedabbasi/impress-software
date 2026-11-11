import { z } from "zod";
import { pastOrTodayDate, itemQty, inventoryIdField, uniqueItems } from "./gatePassRules.js";

export const itemReturnIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

// Each row is linked to an Inventory item
const itemSchema = z.object({
    inventoryId: inventoryIdField,
    recvdQty: itemQty("Recvd Qty"),
    purpose: z.string().trim().max(100, "Purpose must be at most 100 characters").optional().default(""),
});

const headerFields = {
    date: pastOrTodayDate,
    departmentId: z.coerce.number({ error: "Please select a department" }).int().min(1, "Please select a department"),
};

export const createItemReturnSchema = z.object({
    body: z.object({
        ...headerFields,
        items: uniqueItems(itemSchema),
    }),
});

export const updateItemReturnSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: headerFields.date.optional(),
        departmentId: headerFields.departmentId.optional(),
        items: uniqueItems(itemSchema).optional(),
    }),
});
