import { ApiError } from "./apiError.js";

// Reports can contain a very large number of rows, so they are always read page by page.
export const REPORT_DEFAULT_PAGE_SIZE = 50;
export const REPORT_MAX_PAGE_SIZE = 1000;

export const parsePaging = (query) => {
    const page = Math.max(1, Number.parseInt(query.page, 10) || 1);
    const limit = Math.min(
        REPORT_MAX_PAGE_SIZE,
        Math.max(1, Number.parseInt(query.limit, 10) || REPORT_DEFAULT_PAGE_SIZE)
    );
    return { page, limit, skip: (page - 1) * limit };
};

export const pagingMeta = (total, { page, limit }) => ({
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit)),
});

const parseDate = (value, label) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) throw new ApiError(400, `${label} is not a valid date`);
    return date;
};

// "from" starts at the beginning of its day and "to" includes the whole day
export const buildDateRange = ({ fromDate, toDate }) => {
    if (!fromDate && !toDate) return undefined;
    const range = {};
    if (fromDate) range.gte = parseDate(fromDate, "From date");
    if (toDate) {
        const end = parseDate(toDate, "To date");
        end.setUTCHours(23, 59, 59, 999);
        range.lte = end;
    }
    if (range.gte && range.lte && range.gte > range.lte) {
        throw new ApiError(400, "From date cannot be after To date");
    }
    return range;
};

export const parseVendorId = (vendorId) => {
    if (vendorId === undefined || vendorId === "") return undefined;
    const id = Number(vendorId);
    if (!Number.isInteger(id) || id < 1) throw new ApiError(400, "Vendor is not valid");
    return id;
};
