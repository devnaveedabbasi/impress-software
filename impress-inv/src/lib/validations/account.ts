import { z } from "zod";

export const roleSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim()
    .min(2, "Role name must be at least 2 characters")
    .max(50, "Role name is too long")
    .regex(/^[a-zA-Z\s]+$/, "Role name can only contain letters and spaces"),
  permissionIds: z.array(z.string()).min(1, "Select at least one permission"),
});

export const userSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim().min(2, "Full name must be at least 2 characters").max(100, "Full name is too long"),
  email: z.string().trim().email("Enter a valid email address"),
  password: z.string().optional(),
  role: z.string().min(1, "Select a role"),
  permissionIds: z.array(z.string()).min(1, "Select at least one permission"),
}).superRefine((data, ctx) => {
  // If new user, password is required and must be >= 6 chars
  if (!data.id && (!data.password || data.password.length < 6)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must be at least 6 characters",
      path: ["password"],
    });
  } 
  // If editing user and password provided, it must be >= 6 chars
  else if (data.password && data.password.length > 0 && data.password.length < 6) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password must be at least 6 characters",
      path: ["password"],
    });
  }
  // Max length check
  if (data.password && data.password.length > 100) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Password is too long",
      path: ["password"],
    });
  }
});

export type RoleFormValues = z.infer<typeof roleSchema>;
export type UserFormValues = z.infer<typeof userSchema>;

export const adminSchema = z.object({
  id: z.string().optional(),
  name: z.string().trim()
    .min(2, "Full name must be at least 2 characters")
    .max(100, "Full name is too long")
    .regex(/^[a-zA-Z ]+$/, "Name can only contain letters and spaces"),
  email: z.string().trim().email("Enter a valid email address").max(150, "Email is too long"),
  password: z.string().optional(),
  role: z.enum(["SUPER_ADMIN", "ADMIN"], { message: "Select a role" }),
  permissionIds: z.array(z.string()),
}).superRefine((data, ctx) => {
  const isNew = !data.id;
  if (isNew && (!data.password || data.password.length < 6)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Password must be at least 6 characters", path: ["password"] });
  } else if (data.password && data.password.length > 0 && data.password.length < 6) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Password must be at least 6 characters", path: ["password"] });
  }
  if (data.password && data.password.length > 100) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Password is too long", path: ["password"] });
  }
  // A Super Admin has every permission already; an Admin needs the ones it will use
  if (data.role === "ADMIN" && data.permissionIds.length === 0) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Select at least one permission for an admin", path: ["permissionIds"] });
  }
});

export type AdminFormValues = z.infer<typeof adminSchema>;
