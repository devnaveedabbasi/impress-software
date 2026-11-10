import { z } from "zod";

const colorName = z
    .string()
    .trim()
    .min(1, "Color name is required")
    .max(50, "Color name is too long");

export const colorIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

export const createColorSchema = z.object({
    body: z.object({
        name: colorName,
    }),
});

export const updateColorSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        name: colorName,
    }),
});
