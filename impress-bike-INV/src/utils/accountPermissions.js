import prisma from "../config/prisma.js";
import { ApiError } from "./apiError.js";

// Flattens a user's role + own permissions (same shape the login response always had)
const mapUserPermissions = (user) => {
    const all = [
        ...(user.role?.permissions ? user.role.permissions.map((item) => item.permission) : []),
        ...(user.permissions ? user.permissions.map((item) => item.permission) : []),
    ];
    const unique = new Map();
    for (const p of all) {
        if (!unique.has(p.id)) unique.set(p.id, { id: p.id, name: p.name, operation: p.operation });
    }
    return Array.from(unique.values());
};

const allPermissions = async () =>
    (await prisma.permission.findMany({ orderBy: { id: "asc" } })).map((p) => ({
        id: p.id,
        name: p.name,
        operation: p.operation,
    }));

const permissionDependencies = {
    "city:create": ["province:view"],
    "city:update": ["province:view"],
    "dealer:create": ["province:view", "city:view"],
    "dealer:update": ["province:view", "city:view"],
    "vendor:create": ["province:view", "city:view"],
    "vendor:update": ["province:view", "city:view"],
    "inventory:create": ["category:view", "department:view", "station:view", "color:view"],
    "inventory:update": ["category:view", "department:view", "station:view", "color:view"],
};

export const requiredPermissionKeys = (permission) => [
    permission,
    ...(permissionDependencies[permission] || []),
];

// The permissions an account can use. A super admin has all of them; an admin only the ones it was given.
export const permissionsOfAccount = async (account) => {
    if (account.isSuperAdmin) return allPermissions();
    return mapUserPermissions(account);
};

// Nobody can hand out a permission they do not have themselves (a super admin can hand out any).
export const assertCanGrant = async (actor, permissionIds) => {
    const ids = (permissionIds || []).map(Number);
    if (ids.length === 0) return;

    const permissions = await prisma.permission.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, operation: true },
    });
    const idsByKey = new Map(permissions.map((permission) => [
        `${permission.operation}:${permission.name}`,
        permission.id,
    ]));
    const selectedIds = new Set(ids);

    for (const permission of permissions) {
        const key = `${permission.operation}:${permission.name}`;
        for (const dependency of requiredPermissionKeys(key).slice(1)) {
            const dependencyId = idsByKey.get(dependency);
            if (!dependencyId || !selectedIds.has(dependencyId)) {
                throw new ApiError(400, `${key} requires ${dependency}`);
            }
        }
    }

    if (actor?.isSuperAdmin) return;

    const own = new Set((await permissionsOfAccount(actor)).map((p) => p.id));
    if (ids.some((id) => !own.has(id))) {
        throw new ApiError(403, "You can only give permissions that you have yourself");
    }
};

export { mapUserPermissions };
