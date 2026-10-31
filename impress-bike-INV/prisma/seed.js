import prisma from "../src/config/prisma.js";

const operations = [
    "account_code",
    "role",
    "permission",
    "user",
    "category",
    "city",
    "dealer",
    "department",
    "inventory",
    "province",
    "station",
    "vendor",
    "purchase_order",
    "quotation",
    "inward_quality_control",
    "inward_quality_control_report"
];

const actions = ["view", "create", "update", "delete"];

const permissions = [];

for (const operation of operations) {
    for (const action of actions) {
        permissions.push({
            operation: operation,
            name: action
        });
    }
}

async function main() {
    // Delete all existing permissions before seeding
    await prisma.permission.deleteMany({});
    console.log("Deleted old permissions");

    for (const permission of permissions) {
        await prisma.permission.upsert({
            where: {
                operation_name: {
                    operation: permission.operation,
                    name: permission.name,
                },
            },
            update: {},
            create: {
                operation: permission.operation,
                name: permission.name,
            },
        });
    }

    console.log("Permissions seeded successfully");
}

main()
    .catch((error) => {
        console.error(error);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });