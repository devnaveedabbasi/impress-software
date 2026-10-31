import { z } from "zod";

export const categoryIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

export const createCategorySchema = z.object({
    body: z.object({
        name: z.string().min(1, "Category name is required").max(100, "Name too long"),
    }),
});

export const updateCategorySchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        name: z.string().min(1, "Category name is required").max(100, "Name too long").optional(),
    }),
});
