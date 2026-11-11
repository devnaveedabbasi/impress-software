import prisma from "../config/prisma.js";

// Stock Movement ledger
//
// Every document that moves stock writes its lines to the StockMovement table (+ stock in, - stock out):
//   INWARD          + OK qty of every row
//   SALE_GATE_PASS  - qty of every row
//   STORE_ISSUE     - issue qty of every row
//   ITEM_RETURN     + received qty of every row
//
// Stock in hand of an item = the stock of the Inventory master (InventoryStock rows) + the total of its movements.
// A document owns its lines: saving it again replaces them, deleting it removes them, so the stock always matches
// the documents and no manual correction is needed.

export const SOURCE_LABELS = {
    INWARD: "Inward / Quality Control",
    SALE_GATE_PASS: "Sale Gate Pass",
    STORE_ISSUE: "Store Issuance",
    ITEM_RETURN: "Item Return from Department",
};

// A transaction on the remote LIVE database needs more time than the default 5 seconds
export const TX_OPTIONS = { timeout: 30000, maxWait: 10000 };

// Stock in hand for the given inventory ids: Map(inventoryId -> number). The stock may be negative.
export async function getStockInHand(inventoryIds, client = prisma) {
    const ids = [...new Set(inventoryIds.map(Number))].filter((id) => Number.isInteger(id));
    if (ids.length === 0) return new Map();

    const [master, moved] = await Promise.all([
        client.inventoryStock.groupBy({ by: ["inventoryId"], where: { inventoryId: { in: ids } }, _sum: { qty: true } }),
        client.stockMovement.groupBy({ by: ["inventoryId"], where: { inventoryId: { in: ids } }, _sum: { qty: true } }),
    ]);

    const stock = new Map(ids.map((id) => [id, 0]));
    for (const row of master) stock.set(row.inventoryId, (stock.get(row.inventoryId) || 0) + (row._sum.qty || 0));
    for (const row of moved) stock.set(row.inventoryId, (stock.get(row.inventoryId) || 0) + (row._sum.qty || 0));
    return stock;
}

// Replace the ledger lines of one document (call inside the same transaction that saves the document)
export async function replaceMovements(tx, { sourceType, sourceId, date, rows, userId, note }) {
    await tx.stockMovement.deleteMany({ where: { sourceType, sourceId } });

    // One line per item, lines with qty 0 are not written
    const byItem = new Map();
    for (const row of rows) {
        const qty = Number(row.qty) || 0;
        byItem.set(row.inventoryId, (byItem.get(row.inventoryId) || 0) + qty);
    }
    const data = [...byItem.entries()]
        .filter(([, qty]) => qty !== 0)
        .map(([inventoryId, qty]) => ({
            date,
            inventoryId,
            qty,
            sourceType,
            sourceId,
            note: note || "",
            createdById: userId ?? null,
        }));

    if (data.length > 0) await tx.stockMovement.createMany({ data });
}

// Remove the ledger lines of a deleted document
export async function removeMovements(tx, sourceType, sourceId) {
    await tx.stockMovement.deleteMany({ where: { sourceType, sourceId } });
}
