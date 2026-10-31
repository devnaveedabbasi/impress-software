import { z } from 'zod';

export const createDealerSchema = z.object({
    body: z.object({
        dealarShipName: z.string().min(1, "Dealership Name is required"),
        contactNo: z.string().min(1, "Contact No is required"),
        address: z.string().min(1, "Address is required"),
        saleTaxNo: z.string().min(1, "Sale Tax No is required"),
        NTNNo: z.string().min(1, "NTN No is required"),
        name: z.string().min(1, "Name is required"),
        provinceId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "Province ID must be a positive number"),
        cityId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "City ID must be a positive number"),
        mobileNo: z.string().min(1, "Mobile No is required"),
        opeaningBalance: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val), "Opening Balance must be a valid number"),
        dealarType: z.enum(['single', 'dealar'], {
            errorMap: () => ({ message: "Dealer type must be either 'single' or 'dealar'" })
        }),
        NICNo: z.string().min(1, "NIC No is required"),
    })
});

export const updateDealerSchema = z.object({
    body: z.object({
        dealarShipName: z.string().optional(),
        contactNo: z.string().optional(),
        address: z.string().optional(),
        saleTaxNo: z.string().optional(),
        NTNNo: z.string().optional(),
        name: z.string().optional(),
        provinceId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "Province ID must be a positive number").optional(),
        cityId: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val) && val > 0, "City ID must be a positive number").optional(),
        mobileNo: z.string().optional(),
        opeaningBalance: z.union([z.string(), z.number()]).transform(val => Number(val)).refine(val => !isNaN(val), "Opening Balance must be a valid number").optional(),
        dealarType: z.enum(['single', 'dealar'], {
            errorMap: () => ({ message: "Dealer type must be either 'single' or 'dealar'" })
        }).optional(),
        NICNo: z.string().optional(),
    }).refine(data => Object.keys(data).length > 0, {
        message: "At least one field must be provided for update"
    }),
    params: z.object({
        id: z.string().refine(val => !isNaN(Number(val)), { message: "Invalid ID" })
    })
});

export const dealerIdSchema = z.object({
    params: z.object({
        id: z.string().refine(val => !isNaN(Number(val)), { message: "Invalid ID" })
    })
});
