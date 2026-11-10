// One-time data migration: Inventory.color[] / stationIds[] / qty[]  ->  Color + InventoryStock tables.
//
// Run AFTER the schema with the new Color/InventoryStock tables is pushed, and BEFORE the old
// Inventory columns (color, stationIds, qty) are dropped:
//
//   node prisma/scripts/migrate-inventory-colors.js            -> primary DB (LOCAL_DATABASE_URL / DATABASE_URL)
//   node prisma/scripts/migrate-inventory-colors.js --cloud    -> CLOUD_DATABASE_URL
//   add --dry-run to only print what would happen
//
// Safe to re-run: colors are matched by name, and inventories that already have stock rows are skipped.
// IDs are assigned deterministically (same order on every DB) so local and cloud stay in sync.
import "dotenv/config";
import pg from "pg";

const DEFAULT_COLORS = ["Red", "Black", "Blue", "Silver", "Grey", "White"];

const useCloud = process.argv.includes("--cloud");
const dryRun = process.argv.includes("--dry-run");
const url = useCloud
    ? process.env.CLOUD_DATABASE_URL
    : process.env.LOCAL_DATABASE_URL || process.env.DATABASE_URL;

if (!url) {
    console.error(`No ${useCloud ? "CLOUD_DATABASE_URL" : "LOCAL_DATABASE_URL / DATABASE_URL"} configured`);
    process.exit(1);
}

const isLocal = /localhost|127\.0\.0\.1/.test(url);
const client = new pg.Client({ connectionString: url, ssl: isLocal ? undefined : { rejectUnauthorized: false } });
const label = useCloud ? "CLOUD" : "LOCAL";
const normalize = (name) => String(name || "").trim().toLowerCase();

async function hasOldColumns() {
    const { rows } = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name = 'Inventory' AND column_name IN ('color', 'stationIds', 'qty')`
    );
    return rows.length === 3;
}

async function main() {
    await client.connect();
    console.log(`[${label}] connected${dryRun ? " (dry run)" : ""}`);

    if (!(await hasOldColumns())) {
        console.log(`[${label}] Inventory.color/stationIds/qty columns not found — nothing to migrate.`);
        return;
    }

    await client.query("BEGIN");
    try {
        const { rows: inventories } = await client.query(
            `SELECT id, "itemName", color, "stationIds", qty FROM "Inventory" ORDER BY id`
        );

        // 1. Colors: defaults first, then any other color used in inventory (sorted) — deterministic order
        const { rows: existingColors } = await client.query(`SELECT id, name FROM "Color" ORDER BY id`);
        const colorIdByName = new Map(existingColors.map((c) => [normalize(c.name), c.id]));

        const usedNames = [];
        for (const inv of inventories) {
            for (const name of inv.color || []) {
                if (name && name.trim()) usedNames.push(name.trim());
            }
        }
        const extraNames = [...new Set(usedNames)]
            .filter((name) => !DEFAULT_COLORS.some((d) => normalize(d) === normalize(name)))
            .sort((a, b) => a.localeCompare(b));
        const wantedNames = [];
        for (const name of [...DEFAULT_COLORS, ...extraNames]) {
            if (!wantedNames.some((n) => normalize(n) === normalize(name))) wantedNames.push(name);
        }

        let nextColorId = existingColors.reduce((max, c) => Math.max(max, c.id), 0) + 1;
        for (const name of wantedNames) {
            if (colorIdByName.has(normalize(name))) continue;
            const id = nextColorId++;
            await client.query(
                `INSERT INTO "Color" (id, name, "createdAt", "updatedAt") VALUES ($1, $2, NOW(), NOW())`,
                [id, name]
            );
            colorIdByName.set(normalize(name), id);
            console.log(`[${label}] + color #${id} ${name}`);
        }

        // 2. Stock rows
        const { rows: stations } = await client.query(`SELECT id FROM "Station"`);
        const stationIds = new Set(stations.map((s) => s.id));
        const { rows: alreadyMigrated } = await client.query(`SELECT DISTINCT "inventoryId" FROM "InventoryStock"`);
        const migratedIds = new Set(alreadyMigrated.map((r) => r.inventoryId));
        const { rows: maxStock } = await client.query(`SELECT COALESCE(MAX(id), 0) AS max FROM "InventoryStock"`);
        let nextStockId = Number(maxStock[0].max) + 1;

        const problems = [];
        for (const inv of inventories) {
            if (migratedIds.has(inv.id)) {
                console.log(`[${label}] = inventory #${inv.id} ${inv.itemName}: already has stock rows, skipped`);
                continue;
            }

            // Merge duplicate (station, color) rows by summing their qty
            const merged = new Map();
            (inv.color || []).forEach((name, i) => {
                const stationId = Number(inv.stationIds?.[i]);
                const colorId = colorIdByName.get(normalize(name));
                const qty = Number(inv.qty?.[i]) || 0;
                if (!colorId || !stationIds.has(stationId)) {
                    problems.push(`inventory #${inv.id} ${inv.itemName} row ${i + 1}: station ${stationId} / color "${name}" not found`);
                    return;
                }
                const key = `${stationId}:${colorId}`;
                const row = merged.get(key) || { stationId, colorId, qty: 0 };
                row.qty += qty;
                merged.set(key, row);
            });

            for (const row of merged.values()) {
                const id = nextStockId++;
                await client.query(
                    `INSERT INTO "InventoryStock" (id, "inventoryId", "stationId", "colorId", qty, "createdAt", "updatedAt")
                     VALUES ($1, $2, $3, $4, $5, NOW(), NOW())`,
                    [id, inv.id, row.stationId, row.colorId, row.qty]
                );
                console.log(`[${label}] + stock #${id}: ${inv.itemName} station ${row.stationId} color ${row.colorId} qty ${row.qty}`);
            }
        }

        if (problems.length > 0) {
            console.error(`[${label}] Could not migrate some rows:\n  - ${problems.join("\n  - ")}`);
            throw new Error("Migration aborted — fix the rows above and run again");
        }

        // 3. Keep auto-increment sequences in step with the explicit ids
        for (const table of ["Color", "InventoryStock"]) {
            await client.query(`
                SELECT setval(pg_get_serial_sequence('"${table}"', 'id'),
                              COALESCE((SELECT MAX(id) FROM "${table}"), 1),
                              EXISTS(SELECT 1 FROM "${table}"))
            `);
        }

        if (dryRun) {
            await client.query("ROLLBACK");
            console.log(`[${label}] dry run — rolled back`);
        } else {
            await client.query("COMMIT");
            console.log(`[${label}] migration committed`);
        }
    } catch (error) {
        await client.query("ROLLBACK").catch(() => {});
        throw error;
    }
}

main()
    .catch((error) => {
        console.error(`[${label}] ${error.message}`);
        process.exitCode = 1;
    })
    .finally(() => client.end().catch(() => {}));
