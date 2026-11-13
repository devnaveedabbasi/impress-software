// One-time data migration: users that have the "admin" role (User table)  ->  Admin table as SUPER_ADMIN.
//
// Run AFTER the Admin / AdminPermission tables are pushed:
//
//   node prisma/scripts/move-admin-to-admin-table.js            -> primary DB (LOCAL_DATABASE_URL / DATABASE_URL)
//   node prisma/scripts/move-admin-to-admin-table.js --cloud    -> CLOUD_DATABASE_URL
//   add --dry-run to only print what would happen
//
// Safe to re-run: an admin that already exists in the Admin table (same email) is not copied again.
// The password hash is copied as it is, so the admin signs in with the same email and password.
// The old User row is removed afterwards (a user and an admin cannot share an email), inside one transaction.
import "dotenv/config";
import pg from "pg";

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

async function main() {
    await client.connect();
    console.log(`[${label}] connected${dryRun ? " (dry run, nothing is written)" : ""}`);

    const { rows: admins } = await client.query(
        `SELECT u.id, u.name, u.email, u.password
           FROM "User" u JOIN "Role" r ON r.id = u."roleId"
          WHERE lower(r.name) = 'admin'
          ORDER BY u.id`
    );
    console.log(`[${label}] users with the admin role: ${admins.length}`);
    if (admins.length === 0) return;

    await client.query("BEGIN");
    try {
        for (const user of admins) {
            const { rows: existing } = await client.query(`SELECT id FROM "Admin" WHERE email = $1`, [user.email]);
            if (existing.length > 0) {
                console.log(`  - ${user.email}: already in the Admin table, only the old User row is removed`);
            } else {
                console.log(`  - ${user.email}: copied to the Admin table as SUPER_ADMIN`);
                if (!dryRun) {
                    await client.query(
                        `INSERT INTO "Admin" (name, email, password, role, "updatedAt")
                         VALUES ($1, $2, $3, 'SUPER_ADMIN', CURRENT_TIMESTAMP)`,
                        [user.name, user.email, user.password]
                    );
                }
            }
            if (!dryRun) {
                // UserPermission rows go with the user (ON DELETE CASCADE)
                await client.query(`DELETE FROM "User" WHERE id = $1`, [user.id]);
            }
        }
        await client.query(dryRun ? "ROLLBACK" : "COMMIT");
        console.log(`[${label}] done`);
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    }
}

main()
    .catch((error) => {
        console.error("Migration failed:", error);
        process.exitCode = 1;
    })
    .finally(() => client.end());
