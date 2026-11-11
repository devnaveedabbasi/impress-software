import { z } from "zod";
import { pastOrTodayDate, itemQty, inventoryIdField, uniqueItems } from "./gatePassRules.js";

export const saleGatePassIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

// Each row is linked to an Inventory item. Stock in hand is NOT accepted from the client: the server reads it.
const itemSchema = z.object({
    inventoryId: inventoryIdField,
    unit: z.string().trim().max(20, "Unit must be at most 20 characters").optional().default(""),
    qty: itemQty("Qty"),
});

const throughBy = z.string().trim().max(100, "Through By is too long").refine((value) => value === "" || value.length >= 2, "Through By must be at least 2 characters");
const vehicleNo = z
    .string()
    .trim()
    .max(20, "Vehicle No must be at most 20 characters")
    .regex(/^([A-Za-z0-9][A-Za-z0-9\- ]*)?$/, "Vehicle No can only have letters, numbers, spaces and -");
const remarks = z.string().trim().max(255, "Remarks must be at most 255 characters");

const headerFields = {
    date: pastOrTodayDate,
    accountName: z.string().trim().min(2, "Account Name must be at least 2 characters").max(100, "Account Name is too long"),
    billNO: z.coerce.number().int().min(0, "Bill No cannot be negative").max(999_999_999, "Bill No is too long").nullable().optional(),
    throughBy: throughBy.optional().default(""),
    remarks: remarks.optional().default(""),
    vehicleNo: vehicleNo.optional().default(""),
};

export const createSaleGatePassSchema = z.object({
    body: z.object({
        ...headerFields,
        items: uniqueItems(itemSchema),
    }),
});

export const updateSaleGatePassSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: headerFields.date.optional(),
        accountName: headerFields.accountName.optional(),
        billNO: headerFields.billNO,
        throughBy: throughBy.optional(),
        remarks: remarks.optional(),
        vehicleNo: vehicleNo.optional(),
        items: uniqueItems(itemSchema).optional(),
    }),
});
