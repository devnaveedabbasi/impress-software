import { z } from "zod";

// Rules shared by the gate pass documents (Sale Gate Pass, Rejection Return To Vendor)

export const MAX_ITEM_QTY = 1_000_000;

// A gate pass cannot be dated in the future (one day of tolerance for time zones)
export const pastOrTodayDate = z
    .string()
    .min(1, "Date is required")
    .refine((value) => !Number.isNaN(new Date(value).getTime()), "Date is not valid")
    .refine((value) => new Date(value).getTime() <= Date.now() + 24 * 60 * 60 * 1000, "Date cannot be in the future");

export const itemQty = (label) =>
    z.coerce
        .number({ error: `${label} is required` })
        .int(`${label} must be a whole number`)
        .min(1, `${label} must be at least 1`)
        .max(MAX_ITEM_QTY, `${label} cannot be more than ${MAX_ITEM_QTY.toLocaleString()}`);

export const inventoryIdField = z.coerce
    .number({ error: "Please select an item from inventory" })
    .int()
    .min(1, "Please select an item from inventory");

// Items of one document: at least one row, the same inventory item only once
export const uniqueItems = (itemSchema) =>
    z
        .array(itemSchema)
        .min(1, "At least one item row is required")
        .max(500, "Too many item rows")
        .refine((items) => new Set(items.map((item) => item.inventoryId)).size === items.length, {
            message: "The same inventory item cannot be added twice",
        });

export const codeText = (label) =>
    z
        .string()
        .trim()
        .max(50, `${label} must be at most 50 characters`)
        .regex(/^[A-Za-z0-9\-/ ]*$/, `${label} can only have letters, numbers, spaces, - and /`);
