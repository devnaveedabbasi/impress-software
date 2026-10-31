import { ZodError } from 'zod';
import { ApiError } from '../utils/apiError.js';

export const validate = (schema) => (req, res, next) => {
    try {
        schema.parse({
            body: req.body,
            query: req.query,
            params: req.params,
        });
        next();
    } catch (error) {
        if (error instanceof ZodError) {
            const issues = error.errors || error.issues || [];
            const errorMessages = issues.map((issue) => {
                let message = issue.message;
                // Make Zod default missing field errors more readable
                if (message.includes("expected string, received undefined") || message === "Required") {
                    const fieldName = issue.path ? issue.path[issue.path.length - 1] : "Field";
                    message = `${fieldName} is required`;
                }

                return {
                    field: issue.path?.join('.') || '',
                    message: message,
                }
            });

            // Create a descriptive message from the first error, or combine them
            const mainMessage = errorMessages.length > 0
                ? `${errorMessages[0].field.replace('body.', '')}: ${errorMessages[0].message}`
                : "Validation failed";

            // Pass the errors array to ApiError
            next(new ApiError(400, mainMessage, errorMessages));
        } else {
            next(error);
        }
    }
};
