import { ApiError } from '../utils/apiError.js';
import { isConnectionError } from '../config/prisma.js';

const errorHandler = (err, req, res, next) => {
    console.error(" Error:", err);
    // Web always uses the LIVE database, so tell the user clearly when it cannot be reached
    if (isConnectionError(err)) {
        return res.status(503).json({
            success: false,
            code: 503,
            message: "Cannot connect to the live database. Please check your internet connection and try again.",
            data: null,
        });
    }

    // ========================
    //  Mongoose Validation
    // ========================
    if (err.name === "ValidationError") {
        const errors = Object.values(err.errors).map(e => e.message);

        return res.status(400).json({
            success: false,
            code: 400,
            message: "Validation Error",
            errors: errors,
            data: null,
        });
    }

    if (
        String(err?.message || "").includes("City_name_key") ||
        String(err?.message || "").includes("Unique constraint failed")
    ) {
        return res.status(409).json({
            success: false,
            code: 409,
            message: "City already exists.",
            data: null,
        });
    }

    if (err instanceof ApiError) {
        return res.status(err.statusCode).json({
            success: false,
            code: err.statusCode,
            message: err.message,
            errors: err.errors && err.errors.length > 0 ? err.errors : undefined,
            data: null,
        });
    }


    return res.status(500).json({
        success: false,
        code: 500,
        message: err.message || "Something went wrong",
        data: null,
    });
};

export default errorHandler;