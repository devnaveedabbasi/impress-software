import { z } from "zod";

export const inventoryIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

// One stock row: Station + Color (both linked tables) + quantity
const stockRowSchema = z.object({
    stationId: z.coerce.number({ error: "Station is required" }).int().min(1, "Station is required"),
    colorId: z.coerce.number({ error: "Color is required" }).int().min(1, "Color is required"),
    qty: z.coerce.number({ error: "Quantity must be a number" }).int().min(0, "Quantity cannot be negative"),
});

const stocksSchema = z
    .array(stockRowSchema)
    .min(1, "At least one Station / Color / Qty row is required")
    .refine(
        (rows) => new Set(rows.map((row) => `${row.stationId}:${row.colorId}`)).size === rows.length,
        { message: "The same Station + Color combination cannot be added twice" }
    );

export const createInventorySchema = z.object({
    body: z.object({
        itemName: z.string().min(1, "Item name is required").max(200, "Item name too long"),
        categoryId: z.coerce.number({ error: "Category ID must be a number" }),
        departmentId: z.coerce.number({ error: "Department ID must be a number" }),
        pack: z.coerce.number({ error: "Pack must be a number" }),
        rate: z.coerce.number({ error: "Rate must be a number" }),
        unitPerBike: z.coerce.number({ error: "Unit per bike must be a number" }),
        stocks: stocksSchema,
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
        stocks: stocksSchema.optional(),
    }),
});
