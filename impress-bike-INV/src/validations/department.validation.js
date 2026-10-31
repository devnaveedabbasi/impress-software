import { z } from "zod";

export const departmentIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

export const createDepartmentSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Department name is required").max(100, "Name too long"),
    }),
});

export const updateDepartmentSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        name: z.string().min(1, "Department name is required").max(100, "Name too long").optional(),
    }),
});
