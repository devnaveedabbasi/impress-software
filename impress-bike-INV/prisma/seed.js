import "dotenv/config";
import bcrypt from "bcryptjs";
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
  "inward_quality_control_report",
  "sale_gate_pass",
  "rejection_return_to_vendor",
];

const actions = ["view", "create", "update", "delete"];

async function seedPermissions() {
  const permissions = [];
  for (const operation of operations) {
    for (const name of actions) {
      permissions.push({ operation, name });
    }
  }

  for (const permission of permissions) {
    await prisma.permission.upsert({
      where: {
        operation_name: {
          operation: permission.operation,
          name: permission.name,
        },
      },
      update: {},
      create: permission,
    });
  }

  return prisma.permission.findMany();
}

async function seedAdmin(permissions) {
  const adminRole = await prisma.role.upsert({
    where: { name: "admin" },
    update: {},
    create: { name: "admin" },
  });

  for (const permission of permissions) {
    await prisma.rolePermission.upsert({
      where: {
        roleId_permissionId: {
          roleId: adminRole.id,
          permissionId: permission.id,
        },
      },
      update: {},
      create: {
        roleId: adminRole.id,
        permissionId: permission.id,
      },
    });
  }

  const email = process.env.SEED_ADMIN_EMAIL || "admin@impress-bike.local";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const hashedPassword = await bcrypt.hash(password, 10);

  const adminUser = await prisma.user.upsert({
    where: { email },
    update: {
      name: process.env.SEED_ADMIN_NAME || "System Administrator",
      roleId: adminRole.id,
    },
    create: {
      name: process.env.SEED_ADMIN_NAME || "System Administrator",
      email,
      password: hashedPassword,
      roleId: adminRole.id,
    },
  });

  return { adminRole, adminUser, email, password };
}

async function seedMasterData() {
  const province = await prisma.province.upsert({
    where: { name: "Punjab" },
    update: {},
    create: { name: "Punjab" },
  });

  await prisma.city.upsert({
    where: { name: "Lahore" },
    update: { provinceId: province.id },
    create: { name: "Lahore", provinceId: province.id },
  });

  for (const name of ["General", "Spare Parts"]) {
    await prisma.category.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const name of ["Store", "Purchase", "Sales"]) {
    await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
  }

  for (const name of ["Main Store", "Production Line"]) {
    await prisma.station.upsert({ where: { name }, update: {}, create: { name } });
  }
}

async function main() {
  const permissions = await seedPermissions();
  const { adminUser, email, password } = await seedAdmin(permissions);
  await seedMasterData();

  console.log(`Seed completed successfully. Admin user: ${adminUser.email}`);
  if (!process.env.SEED_ADMIN_PASSWORD) {
    console.warn(
      `Default seed password is "${password}". Set SEED_ADMIN_PASSWORD in .env before production use.`
    );
  }
  console.log(`Total permissions: ${permissions.length}`);
}

main()
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
