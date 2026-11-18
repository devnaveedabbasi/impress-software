// Paged + searchable lists for the master entries (View All with infinite scroll).
//
// A list endpoint stays as it was (the whole list) unless the request has a "limit". With a limit it returns one page:
//   GET /x?limit=50&cursor=120&q=lah   ->   { items, nextCursor, hasMore }
// The paging is by the id (keyset): "give me the next 50 after id 120". It stays fast on 100k rows, unlike skip/offset.

const MAX_LIMIT = 200;

export const isPagedRequest = (req) => req.query.limit !== undefined && req.query.limit !== "";

export const parseListQuery = (req) => {
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 50, 1), MAX_LIMIT);
    const cursorNo = parseInt(req.query.cursor, 10);
    const cursor = Number.isFinite(cursorNo) ? cursorNo : null;
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 100) : "";
    return { limit, cursor, q };
};

// where-condition for the search text: the id (when it is a number), the text columns, and a column of a relation
// (for example the province name of a city). relationFields: [["province", "name"], ...]
export const buildSearchWhere = (q, textFields = [], relationFields = []) => {
    if (!q) return undefined;
    const contains = { contains: q, mode: "insensitive" };
    const or = textFields.map((field) => ({ [field]: contains }));
    for (const [relation, field] of relationFields) or.push({ [relation]: { [field]: contains } });
    if (/^\d{1,9}$/.test(q)) or.push({ id: Number(q) });
    return or.length ? { OR: or } : undefined;
};

// Reads one page of a model. `after` runs on the page's rows only (inventory adds its stock there).
export const findPage = async (delegate, req, { searchFields = [], relationFields = [], include, after } = {}) => {
    const { limit, cursor, q } = parseListQuery(req);
    const rows = await delegate.findMany({
        where: buildSearchWhere(q, searchFields, relationFields),
        orderBy: { id: "asc" },
        take: limit + 1,
        ...(cursor !== null ? { cursor: { id: cursor }, skip: 1 } : {}),
        ...(include ? { include } : {}),
    });
    const hasMore = rows.length > limit;
    let items = hasMore ? rows.slice(0, limit) : rows;
    if (after) items = await after(items);
    return { items, hasMore, nextCursor: hasMore ? items[items.length - 1].id : null };
};

// ---- Printing ----
// A print of a master entry reads only the records that were chosen in the Print dialog, not the whole table:
//   ?print=1&id=5  |  &from=10&to=40  |  &last=100  |  (nothing = all, at most PRINT_MAX)
// Answer: { items, total, truncated }   (total = how many records the choice covers)
const PRINT_MAX = 2000;

export const isPrintRequest = (req) => req.query.print !== undefined && req.query.print !== "";

const whole = (value) => (typeof value === "string" && /^\d{1,9}$/.test(value) ? Number(value) : null);

export const findPrintRows = async (delegate, req, { include } = {}) => {
    const id = whole(req.query.id);
    const from = whole(req.query.from);
    const to = whole(req.query.to);
    const last = whole(req.query.last);
    const inc = include ? { include } : {};

    if (id !== null) {
        const items = await delegate.findMany({ where: { id }, ...inc });
        return { items, total: items.length, truncated: false };
    }
    if (last !== null && last > 0) {
        const take = Math.min(last, PRINT_MAX);
        const items = await delegate.findMany({ orderBy: { id: "desc" }, take, ...inc });
        return { items: items.reverse(), total: items.length, truncated: false };
    }
    const where = from !== null && to !== null ? { id: { gte: from, lte: to } } : undefined;
    const [items, total] = await Promise.all([
        delegate.findMany({ where, orderBy: { id: "asc" }, take: PRINT_MAX, ...inc }),
        delegate.count({ where }),
    ]);
    return { items, total, truncated: total > PRINT_MAX };
};
