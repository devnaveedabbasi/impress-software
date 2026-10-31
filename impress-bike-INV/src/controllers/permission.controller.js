import prisma from "../config/prisma.js";
import asyncHandler from "../utils/asyncHandler.js";
import { ApiResponse } from "../utils/apiResponse.js";
import { ApiError } from "../utils/apiError.js";


// =========================
// GET ALL PERMISSIONS
// =========================

const getPermissions = asyncHandler(async (req, res) => {

    const permissions = await prisma.permission.findMany({
        orderBy: {
            id: "asc",
        },
    });

    // Group permissions by operation
    const groupedPermissions = {};

    permissions.forEach((permission) => {

        if (!groupedPermissions[permission.operation]) {
            groupedPermissions[permission.operation] = {
                operation: permission.operation,
                permissions: [],
            };
        }

        groupedPermissions[permission.operation].permissions.push({
            id: permission.id,
            name: permission.name,
        });
    });

    return res.status(200).json(
        new ApiResponse(
            200,
            groupedPermissions,
            "Permissions fetched successfully"
        )
    );
});


export default {
    getPermissions,
};