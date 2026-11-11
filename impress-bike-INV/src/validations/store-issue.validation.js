import { z } from "zod";
import { pastOrTodayDate, itemQty, inventoryIdField, uniqueItems } from "./gatePassRules.js";

export const storeIssueIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

// Each row is linked to an Inventory item. Upm and Hand Stock are NOT accepted from the client: the server reads them.
const itemSchema = z.object({
    inventoryId: inventoryIdField,
    issueQty: itemQty("Issue Qty"),
    purpose: z.string().trim().max(100, "Purpose must be at most 100 characters").optional().default(""),
});

const idField = (label) =>
    z.coerce.number({ error: `Please select a ${label}` }).int().min(1, `Please select a ${label}`);

const headerFields = {
    date: pastOrTodayDate,
    departmentId: idField("department"),
    colorId: idField("color"),
    bikeQty: itemQty("Bike Qty"),
};

export const createStoreIssueSchema = z.object({
    body: z.object({
        ...headerFields,
        items: uniqueItems(itemSchema),
    }),
});

export const updateStoreIssueSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: headerFields.date.optional(),
        departmentId: headerFields.departmentId.optional(),
        colorId: headerFields.colorId.optional(),
        bikeQty: headerFields.bikeQty.optional(),
        items: uniqueItems(itemSchema).optional(),
    }),
});
