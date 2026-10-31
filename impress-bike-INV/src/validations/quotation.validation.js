import { z } from "zod";

export const quotationIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

const rowDataBody = {
    itemName: z.array(z.string().min(1, "Item name cannot be empty")).min(1, "At least one item is required"),
    oldRate: z.array(z.coerce.number().min(0, "Old rate cannot be negative")).min(1, "At least one old rate is required"),
    proposedRate: z.array(z.coerce.number().min(0, "Proposed rate cannot be negative")).min(1, "At least one proposed rate is required"),
    approvedRate: z.array(z.coerce.number().min(0, "Approved rate cannot be negative")).min(1, "At least one approved rate is required"),
};

export const createQuotationSchema = z.object({
    body: z.object({
        date: z.coerce.date({ required_error: "Date is required", invalid_type_error: "Date must be valid" }),
        vendorId: z.coerce.number({ required_error: "Vendor ID is required", invalid_type_error: "Vendor ID must be a number" }),
        remarks: z.string().min(1, "Remarks are required"),
        ...rowDataBody,
    }).refine((data) => {
        const lengths = [data.itemName.length, data.oldRate.length, data.proposedRate.length, data.approvedRate.length];
        return lengths.every((l) => l === lengths[0]);
    }, {
        message: "Each row must have a matching item name, old rate, proposed rate, and approved rate",
        path: ["itemName"],
    }),
});

export const updateQuotationSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        date: z.coerce.date().optional(),
        vendorId: z.coerce.number().optional(),
        remarks: z.string().min(1).optional(),
        itemName: z.array(z.string().min(1)).optional(),
        oldRate: z.array(z.coerce.number().min(0)).optional(),
        proposedRate: z.array(z.coerce.number().min(0)).optional(),
        approvedRate: z.array(z.coerce.number().min(0)).optional(),
    }).refine((data) => {
        const lengths = [
            data.itemName?.length,
            data.oldRate?.length,
            data.proposedRate?.length,
            data.approvedRate?.length
        ].filter((l) => l !== undefined);
        return lengths.length === 0 || lengths.every((l) => l === lengths[0]);
    }, {
        message: "Each row must have a matching item name, old rate, proposed rate, and approved rate",
        path: ["itemName"],
    }),
});
