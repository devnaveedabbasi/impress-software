import { z } from "zod";

export const stationIdSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
});

export const createStationSchema = z.object({
    body: z.object({
        name: z.string().min(1, "Station name is required").max(100, "Name too long"),
    }),
});

export const updateStationSchema = z.object({
    params: z.object({
        id: z.string().regex(/^\d+$/, "Id must be a valid number"),
    }),
    body: z.object({
        name: z.string().min(1, "Station name is required").max(100, "Name too long").optional(),
    }),
});
