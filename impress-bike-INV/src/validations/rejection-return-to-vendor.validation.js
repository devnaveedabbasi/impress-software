import { z } from "zod";
import { pastOrTodayDate, itemQty, inventoryIdField, uniqueItems, codeText } from "./gatePassRules.js";

export const rejectionReturnIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

// Each row is linked to an Inventory item
const itemSchema = z.object({
    inventoryId: inventoryIdField,
    rej: itemQty("Rej qty"),
    report: z.string().trim().max(255, "Report must be at most 255 characters").optional().default(""),
});

const address = z.string().trim().min(5, "Address must be at least 5 characters").max(255, "Address must be at most 255 characters");
const contactNo = z
    .string()
    .trim()
    .min(1, "Contact No is required")
    .max(100, "Contact No must be at most 100 characters")
    .regex(/^[0-9+\-\s,()/]{5,}$/, "Enter a valid contact number (digits, spaces and + - , ( ) only, at least 5 characters)");
const saleTaxNo = z
    .string()
    .trim()
    .min(3, "Sale Tax No must be at least 3 characters")
    .max(50, "Sale Tax No must be at most 50 characters")
    .regex(/^[A-Za-z0-9\-/ ]+$/, "Sale Tax No can only have letters, numbers, spaces, - and /");
const transport = z.string().trim().min(2, "Transport must be at least 2 characters").max(100, "Transport must be at most 100 characters");
const receivedBy = z.string().trim().min(2, "Received By must be at least 2 characters").max(100, "Received By must be at most 100 characters");

const headerFields = {
    date: pastOrTodayDate,
    vendorId: z.coerce.number({ error: "Please select a vendor" }).int().min(1, "Please select a vendor"),
    address,
    contactNo,
    saleTaxNo,
    transport,
    builtyNo: codeText("Builty No").optional().default(""),
    bookNo: codeText("Book No").optional().default(""),
    receivedBy,
};

export const createRejectionReturnSchema = z.object({
    body: z.object({
        ...headerFields,
        items: uniqueItems(itemSchema),
    }),
});

export const updateRejectionReturnSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: headerFields.date.optional(),
        vendorId: headerFields.vendorId.optional(),
        address: address.optional(),
        contactNo: contactNo.optional(),
        saleTaxNo: saleTaxNo.optional(),
        transport: transport.optional(),
        builtyNo: codeText("Builty No").optional(),
        bookNo: codeText("Book No").optional(),
        receivedBy: receivedBy.optional(),
        items: uniqueItems(itemSchema).optional(),
    }),
});
