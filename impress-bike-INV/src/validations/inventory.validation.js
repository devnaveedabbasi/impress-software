import { z } from "zod";

export const inventoryIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

const rowDataBody = {
    stationIds: z.array(z.coerce.number().min(1, "Station ID is required")).min(1, "At least one station is required"),
    color: z.array(z.string().min(1, "Color name cannot be empty")).min(1, "At least one color is required"),
    qty: z.array(z.coerce.number().min(0, "Quantity cannot be negative")).min(1, "At least one quantity is required"),
};

export const createInventorySchema = z.object({
    body: z.object({
        itemName: z.string().min(1, "Item name is required").max(200, "Item name too long"),
        categoryId: z.coerce.number({ required_error: "Category ID is required", invalid_type_error: "Category ID must be a number" }),
        departmentId: z.coerce.number({ required_error: "Department ID is required", invalid_type_error: "Department ID must be a number" }),
        pack: z.coerce.number({ required_error: "Pack is required", invalid_type_error: "Pack must be a number" }),
        rate: z.coerce.number({ required_error: "Rate is required", invalid_type_error: "Rate must be a number" }),
        unitPerBike: z.coerce.number({ required_error: "Unit per bike is required", invalid_type_error: "Unit per bike must be a number" }),
        ...rowDataBody,
    }).refine((data) => data.color.length === data.qty.length && data.color.length === data.stationIds.length, {
        message: "Each row must have a matching station, color, and quantity",
        path: ["qty"],
    }),
});

export const updateInventorySchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        itemName: z.string().min(1, "Item name is required").max(200, "Item name too long").optional(),
        categoryId: z.coerce.number().optional(),
        departmentId: z.coerce.number().optional(),
        pack: z.coerce.number().optional(),
        rate: z.coerce.number().optional(),
        unitPerBike: z.coerce.number().optional(),
        stationIds: z.array(z.coerce.number().min(1)).optional(),
        color: z.array(z.string().min(1)).optional(),
        qty: z.array(z.coerce.number().min(0)).optional(),
    }).refine((data) => {
        const lengths = [
            data.color?.length,
            data.qty?.length,
            data.stationIds?.length
        ].filter(l => l !== undefined);
        return lengths.length === 0 || lengths.every(l => l === lengths[0]);
    }, {
        message: "Each row must have a matching station, color, and quantity",
        path: ["qty"],
    }),
});
