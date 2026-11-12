import { z } from "zod";
import { pastOrTodayDate, itemQty, inventoryIdField, uniqueItems } from "./gatePassRules.js";

export const stockTransferIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

// Each row is an OLD item whose stock moves to the new item
const itemSchema = z.object({
    inventoryId: inventoryIdField,
    qty: itemQty("Qty"),
});

const body = z
    .object({
        date: pastOrTodayDate,
        newInventoryId: z.coerce
            .number({ error: "Please select the new item" })
            .int()
            .min(1, "Please select the new item"),
        items: uniqueItems(itemSchema),
    })
    .refine((value) => !value.items.some((item) => item.inventoryId === value.newInventoryId), {
        message: "The new item cannot also be one of the old items",
        path: ["newInventoryId"],
    });

export const createStockTransferSchema = z.object({ body });

export const updateStockTransferSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body,
});
