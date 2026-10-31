import { ApiError } from '../utils/apiError.js';

const errorHandler = (err, req, res, next) => {
    console.error(" Error:", err);

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