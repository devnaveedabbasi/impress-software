import { z } from "zod";

const id = z.string().regex(/^\d+$/, "Id must be a valid number");

const name = z
    .string()
    .trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name is too long")
    .regex(/^[a-zA-Z ]+$/, "Name can only contain letters and spaces");

const email = z.string().trim().email("Enter a valid email address").max(150, "Email is too long");

const password = z.string().min(6, "Password must be at least 6 characters").max(100, "Password is too long");

const role = z.enum(["SUPER_ADMIN", "ADMIN"], { message: "Role must be SUPER_ADMIN or ADMIN" });

const permissionIds = z.array(z.number().int().positive()).default([]);
const optionalPermissionIds = z.array(z.number().int().positive()).optional();

export const adminIdSchema = z.object({ params: z.object({ id }) });

// An ADMIN needs at least one permission (a Super Admin has all of them, so none is needed)
const needsPermissions = (data, ctx) => {
    if (data.role === "ADMIN" && (!data.permissionIds || data.permissionIds.length === 0)) {
        ctx.addIssue({ code: "custom", path: ["permissionIds"], message: "Select at least one permission for an admin" });
    }
};

export const createAdminSchema = z.object({
    body: z.object({ name, email, password, role, permissionIds }).superRefine(needsPermissions),
});

export const updateAdminSchema = z.object({
    params: z.object({ id }),
    body: z
        .object({
            name: name.optional(),
            email: email.optional(),
            password: password.optional().or(z.literal("")),
            role: role.optional(),
            permissionIds: optionalPermissionIds,
        })
        .superRefine((data, ctx) => {
            if (Object.keys(data).length === 0) {
                ctx.addIssue({
                    code: "custom",
                    message: "At least one field is required",
                });
            }

            if (
                data.permissionIds &&
                data.role !== "SUPER_ADMIN" &&
                data.permissionIds.length === 0
            ) {
                needsPermissions({ role: data.role || "ADMIN", permissionIds: data.permissionIds }, ctx);
            }
        }),
});
