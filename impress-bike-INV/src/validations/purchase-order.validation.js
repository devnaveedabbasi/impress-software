import { z } from "zod";

export const purchaseOrderIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

const rowDataBody = {
    code: z.array(z.coerce.number().min(1, "Code cannot be empty")).min(1, "At least one code is required"),
    itemName: z.array(z.string().min(1, "Item name cannot be empty")).min(1, "At least one item name is required"),
    unit: z.array(z.coerce.number().min(0, "Unit cannot be negative")).min(1, "At least one unit is required"),
    quantity: z.array(z.coerce.number().min(1, "Quantity must be at least 1")).min(1, "At least one quantity is required"),
    rate: z.array(z.coerce.number().min(0, "Rate cannot be negative")).min(1, "At least one rate is required"),
    amount: z.array(z.coerce.number().min(0, "Amount cannot be negative")).min(1, "At least one amount is required"),
};

export const createPurchaseOrderSchema = z.object({
    body: z.object({
        date: z.coerce.date({ required_error: "Date is required", invalid_type_error: "Date must be valid" }),
        vendorId: z.coerce.number({ required_error: "Vendor ID is required", invalid_type_error: "Vendor ID must be a number" }),
        validity: z.string().min(1, "Validity is required"),
        instruction: z.string().min(1, "Instruction is required"),
        quotationId: z.coerce.number({ required_error: "Quotation ID is required", invalid_type_error: "Quotation ID must be a number" }),
        
        ...rowDataBody,
        
        total: z.coerce.number().min(0),
        saleTaxPercent: z.coerce.number().min(0),
        totalWithSaleTax: z.coerce.number().min(0),
        withHoldingPercent: z.coerce.number().min(0),
        withHoldingAmount: z.coerce.number().min(0),
        grandTotal: z.coerce.number().min(0),
    }).refine((data) => {
        const lengths = [
            data.code.length, data.itemName.length, data.unit.length,
            data.quantity.length, data.rate.length, data.amount.length
        ];
        return lengths.every((l) => l === lengths[0]);
    }, {
        message: "Each row must have matching code, itemName, unit, quantity, rate, and amount",
        path: ["itemName"],
    }),
});

export const updatePurchaseOrderSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: z.coerce.date().optional(),
        vendorId: z.coerce.number().optional(),
        validity: z.string().min(1).optional(),
        instruction: z.string().min(1).optional(),
        quotationId: z.coerce.number().optional(),
        
        code: z.array(z.coerce.number().min(1)).optional(),
        itemName: z.array(z.string().min(1)).optional(),
        unit: z.array(z.coerce.number().min(0)).optional(),
        quantity: z.array(z.coerce.number().min(1)).optional(),
        rate: z.array(z.coerce.number().min(0)).optional(),
        amount: z.array(z.coerce.number().min(0)).optional(),

        total: z.coerce.number().min(0).optional(),
        saleTaxPercent: z.coerce.number().min(0).optional(),
        totalWithSaleTax: z.coerce.number().min(0).optional(),
        withHoldingPercent: z.coerce.number().min(0).optional(),
        withHoldingAmount: z.coerce.number().min(0).optional(),
        grandTotal: z.coerce.number().min(0).optional(),
    }).refine((data) => {
        const lengths = [
            data.code?.length, data.itemName?.length, data.unit?.length,
            data.quantity?.length, data.rate?.length, data.amount?.length
        ].filter((l) => l !== undefined);
        return lengths.length === 0 || lengths.every((l) => l === lengths[0]);
    }, {
        message: "Each row must have matching code, itemName, unit, quantity, rate, and amount",
        path: ["itemName"],
    }),
});
