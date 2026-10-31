import { z } from 'zod';

export const createVendorSchema = z.object({
    body: z.object({
        vendorName: z.string().min(1, "Vendor Name is required"),
        address: z.string().min(1, "Address is required"),
        saleTaxNo: z.string().min(1, "Sale Tax No is required"),
        provinceId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "Province ID must be a positive number"),
        cityId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "City ID must be a positive number"),
        contactNo: z.string().min(1, "Contact No is required"),
        NICNo: z.string().min(1, "NIC No is required"),
        mobileNo: z.string().min(1, "Mobile No is required"),
        daysLimit: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val >= 0, "Days Limit must be a non-negative number"),
        NTNNo: z.string().min(1, "NTN No is required"),
        CNICNo: z.string().min(1, "CNIC No is required"),
        amoutLimit: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val >= 0, "Amount Limit must be a non-negative number"),
        openingBalance: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val), "Opening Balance must be a valid number"),
    })
});

export const updateVendorSchema = z.object({
    body: z.object({
        vendorName: z.string().optional(),
        address: z.string().optional(),
        saleTaxNo: z.string().optional(),
        provinceId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "Province ID must be a positive number").optional(),
        cityId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "City ID must be a positive number").optional(),
        contactNo: z.string().optional(),
        NICNo: z.string().optional(),
        mobileNo: z.string().optional(),
        daysLimit: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val >= 0, "Days Limit must be a non-negative number").optional(),
        NTNNo: z.string().optional(),
        CNICNo: z.string().optional(),
        amoutLimit: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val >= 0, "Amount Limit must be a non-negative number").optional(),
        openingBalance: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val), "Opening Balance must be a valid number").optional(),
    }).refine(data => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    }),
    params: z.object({
        id: z.string().refine(val => !isNaN(Number(val)), { message: "Invalid ID" })
    })
});

export const vendorIdSchema = z.object({
    params: z.object({
        id: z.string().refine(val => !isNaN(Number(val)), { message: "Invalid ID" })
    })
});
