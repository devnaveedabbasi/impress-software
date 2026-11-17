import { z } from "zod";
import { pastOrTodayDate, codeText } from "./gatePassRules.js";

const id = z.string().regex(/^\d+$/, "Id must be a valid number");

export const vendorBillIdSchema = z.object({ params: z.object({ id }) });

// The Bill # is the number of the bill document itself (its id), it is not typed
const billFields = {
    stInvNo: codeText("S.Tax Inv No").min(1, "S.Tax Inv No is required"),
    stInvDate: pastOrTodayDate,
    saleTaxPercent: z.coerce
        .number({ error: "Sales Tax rate is required" })
        .int("Sales Tax rate must be a whole number")
        .min(0, "Sales Tax rate cannot be negative")
        .max(100, "Sales Tax rate cannot be more than 100"),
};

export const createVendorBillSchema = z.object({
    body: z.object({
        inwardId: z.coerce.number({ error: "Please select an inward" }).int().min(1, "Please select an inward"),
        ...billFields,
    }),
});

// The inward of a bill never changes, only the details of the bill
export const updateVendorBillSchema = z.object({
    params: z.object({ id }),
    body: z.object({
        ...billFields,
        // Pending / Approved / Rejected. Approved posts the bill and locks it.
        status: z.enum(["DRAFT", "APPROVED", "REJECTED"], { message: "Status is not valid" }).optional(),
    }),
});

export const previewVendorBillSchema = z.object({
    query: z.object({
        inwardId: z.coerce.number({ error: "Please select an inward" }).int().min(1, "Please select an inward"),
        saleTaxPercent: z.coerce.number().int().min(0).max(100).optional(),
    }),
});
