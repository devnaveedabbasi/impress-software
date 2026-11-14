import "dotenv/config";
import bcrypt from "bcryptjs";
import prisma, { prismaCloud, prismaLocal } from "../src/config/prisma.js";

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
  "color",
  "vendor",
  "purchase_order",
  "quotation",
  "inward_quality_control",
  "inward_quality_control_report",
  "sale_gate_pass",
  "rejection_return_to_vendor",
  "rejection_received_from_dealer",
  "issue_from_line",
  "item_return_from_department",
  "transfer_form",
  "item_ledger",
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

// The first Super Admin lives in the Admin table (not in User). A Super Admin always has every permission,
// so nothing is attached to it; other admins are created from the Admins page.
async function seedAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL || "admin@impress-bike";
  const password = process.env.SEED_ADMIN_PASSWORD || "ChangeMe123!";
  const hashedPassword = await bcrypt.hash(password, 10);

  const adminUser = await prisma.admin.upsert({
    where: { email },
    update: {
      name: process.env.SEED_ADMIN_NAME || "System Administrator",
      role: "SUPER_ADMIN",
      isSystem: true,
    },
    create: {
      name: process.env.SEED_ADMIN_NAME || "System Administrator",
      email,
      password: hashedPassword,
      role: "SUPER_ADMIN",
      isSystem: true,
    },
  });

  return { adminUser, email, password };
}

async function seedMasterData(actorId) {
  const provinces = {};
  for (const name of ["Punjab", "Sindh"]) {
    provinces[name] = await prisma.province.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }

  const cities = {};
  for (const [name, provinceName] of [
    ["Lahore", "Punjab"],
    ["Faisalabad", "Punjab"],
    ["Rawalpindi", "Punjab"],
    ["Multan", "Punjab"],
    ["Karachi", "Sindh"],
  ]) {
    cities[name] = await prisma.city.upsert({
      where: { name },
      update: { provinceId: provinces[provinceName].id },
      create: { name, provinceId: provinces[provinceName].id },
    });
  }

  const categories = {};
  for (const name of [
    "Motorcycle Parts",
    "Engine Parts",
    "Electrical Parts",
    "Body Parts",
    "Consumables",
    "Lubricants",
    "Safety Accessories",
    "Spare Parts",
  ]) {
    categories[name] = await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, createdById: actorId, updatedById: actorId },
    });
  }

  const departments = {};
  for (const name of [
    "Main Store",
    "Purchase Department",
    "Production Line",
    "Quality Control",
    "Sales Department",
    "Maintenance Department",
    "Warranty Department",
  ]) {
    departments[name] = await prisma.department.upsert({
      where: { name },
      update: {},
      create: { name, createdById: actorId, updatedById: actorId },
    });
  }

  const stations = {};
  for (const name of [
    "Main Store",
    "Engine Assembly",
    "Chassis Assembly",
    "Painting Section",
    "Quality Inspection",
    "Dispatch Store",
  ]) {
    stations[name] = await prisma.station.upsert({
      where: { name },
      update: {},
      create: { name, createdById: actorId, updatedById: actorId },
    });
  }

  const colors = {};
  for (const name of [
    "Pearl Black",
    "Metallic Red",
    "Royal Blue",
    "Graphite Grey",
    "Pearl White",
    "Silver",
  ]) {
    colors[name] = await prisma.color.upsert({
      where: { name },
      update: {},
      create: { name, createdById: actorId, updatedById: actorId },
    });
  }

  const dealers = [
    {
      dealarShipName: "Lahore Motors",
      name: "Muhammad Imran",
      contactNo: "042-35781234",
      address: "Main Boulevard Gulberg, Lahore",
      saleTaxNo: "3277876111111",
      NTNNo: "1234567-8",
      province: "Punjab",
      city: "Lahore",
      mobileNo: "0300-1234567",
      opeaningBalance: 150000,
      dealarType: "dealar",
      NICNo: "35202-1234567-1",
    },
    {
      dealarShipName: "Faisalabad Bike House",
      name: "Ahmed Raza",
      contactNo: "041-2634567",
      address: "Sargodha Road, Faisalabad",
      saleTaxNo: "3277876222222",
      NTNNo: "2345678-9",
      province: "Punjab",
      city: "Faisalabad",
      mobileNo: "0301-2345678",
      opeaningBalance: 85000,
      dealarType: "dealar",
      NICNo: "33100-2345678-3",
    },
    {
      dealarShipName: "Rawalpindi Auto Center",
      name: "Bilal Khan",
      contactNo: "051-5567890",
      address: "Murree Road, Rawalpindi",
      saleTaxNo: "3277876333333",
      NTNNo: "3456789-0",
      province: "Punjab",
      city: "Rawalpindi",
      mobileNo: "0321-3456789",
      opeaningBalance: 120000,
      dealarType: "dealar",
      NICNo: "37405-3456789-5",
    },
    {
      dealarShipName: "Multan Bike World",
      name: "Usman Tariq",
      contactNo: "061-4589123",
      address: "Bosan Road, Multan",
      saleTaxNo: "3277876444444",
      NTNNo: "4567890-1",
      province: "Punjab",
      city: "Multan",
      mobileNo: "0302-4567890",
      opeaningBalance: 60000,
      dealarType: "dealar",
      NICNo: "36102-4567890-7",
    },
  ];

  for (const dealer of dealers) {
    const data = {
      ...dealer,
      provinceId: provinces[dealer.province].id,
      cityId: cities[dealer.city].id,
      createdById: actorId,
      updatedById: actorId,
    };
    delete data.province;
    delete data.city;
    const existing = await prisma.dealer.findFirst({
      where: { dealarShipName: dealer.dealarShipName },
    });
    if (existing) {
      await prisma.dealer.update({ where: { id: existing.id }, data });
    } else {
      await prisma.dealer.create({ data });
    }
  }

  const vendors = [
    {
      vendorName: "Pak Auto Components",
      address: "Sundar Industrial Estate, Lahore",
      saleTaxNo: "3277876555555",
      province: "Punjab",
      city: "Lahore",
      contactNo: "042-37894561",
      NICNo: "35202-1112233-5",
      mobileNo: "0305-1112233",
      daysLimit: 30,
      NTNNo: "1112223-4",
      CNICNo: "35202-1112233-5",
      amoutLimit: 2000000,
      openingBalance: 250000,
    },
    {
      vendorName: "Karachi Motorcycle Parts",
      address: "SITE Area, Karachi",
      saleTaxNo: "3277876666666",
      province: "Sindh",
      city: "Karachi",
      contactNo: "021-34567891",
      NICNo: "42201-2223344-7",
      mobileNo: "0306-2223344",
      daysLimit: 45,
      NTNNo: "2223334-5",
      CNICNo: "42201-2223344-7",
      amoutLimit: 3500000,
      openingBalance: 175000,
    },
    {
      vendorName: "United Electricals",
      address: "Hall Road, Lahore",
      saleTaxNo: "3277876777777",
      province: "Punjab",
      city: "Lahore",
      contactNo: "042-38901234",
      NICNo: "35202-3334455-9",
      mobileNo: "0312-3334455",
      daysLimit: 30,
      NTNNo: "3334445-6",
      CNICNo: "35202-3334455-9",
      amoutLimit: 1000000,
      openingBalance: 90000,
    },
    {
      vendorName: "Al-Hafiz Lubricants",
      address: "Industrial Estate, Multan",
      saleTaxNo: "3277876888888",
      province: "Punjab",
      city: "Multan",
      contactNo: "061-4567891",
      NICNo: "36102-4445566-1",
      mobileNo: "0307-4445566",
      daysLimit: 15,
      NTNNo: "4445556-7",
      CNICNo: "36102-4445566-1",
      amoutLimit: 750000,
      openingBalance: 45000,
    },
  ];

  for (const vendor of vendors) {
    const data = {
      ...vendor,
      provinceId: provinces[vendor.province].id,
      cityId: cities[vendor.city].id,
      createdById: actorId,
      updatedById: actorId,
    };
    delete data.province;
    delete data.city;
    const existing = await prisma.vendor.findFirst({
      where: { vendorName: vendor.vendorName },
    });
    if (existing) {
      await prisma.vendor.update({ where: { id: existing.id }, data });
    } else {
      await prisma.vendor.create({ data });
    }
  }

  const inventoryItems = [
    ["Engine Oil 20W-50", "Lubricants", "Main Store", 1, 1250, 1, [], [500]],
    ["Air Filter 70cc", "Engine Parts", "Main Store", 1, 480, 1, [], [300]],
    ["Spark Plug", "Electrical Parts", "Main Store", 1, 350, 1, [], [600]],
    ["Front Mudguard", "Body Parts", "Production Line", 1, 3800, 1, ["Pearl Black", "Metallic Red", "Royal Blue"], [50, 50, 50]],
    ["Rear Mudguard", "Body Parts", "Production Line", 1, 3200, 1, ["Pearl Black", "Metallic Red", "Royal Blue"], [50, 50, 50]],
    ["Headlight Assembly", "Electrical Parts", "Production Line", 1, 4500, 1, [], [120]],
    ["Brake Shoe Set", "Motorcycle Parts", "Main Store", 1, 850, 2, [], [400]],
    ["Chain Sprocket Kit", "Engine Parts", "Main Store", 1, 2750, 1, [], [250]],
    ["Seat Assembly", "Body Parts", "Production Line", 1, 5800, 1, ["Pearl Black"], [100]],
    ["Battery 12V", "Electrical Parts", "Main Store", 1, 6500, 1, [], [180]],
    ["Tubeless Tyre", "Motorcycle Parts", "Main Store", 1, 4200, 2, [], [300]],
    ["Safety Helmet", "Safety Accessories", "Sales Department", 1, 2500, 1, ["Pearl Black", "Pearl White", "Metallic Red"], [70, 70, 60]],
  ];

  for (const [itemName, category, department, pack, rate, unitPerBike, itemColors, quantities] of inventoryItems) {
    const data = {
      itemName,
      pack,
      rate,
      categoryId: categories[category].id,
      departmentId: departments[department].id,
      stationIds: [stations[department === "Production Line" ? "Chassis Assembly" : "Main Store"].id],
      color: itemColors,
      qty: quantities,
      unitPerBike,
      createdById: actorId,
      updatedById: actorId,
    };
    const existing = await prisma.inventory.findFirst({ where: { itemName } });
    const inventory = existing
      ? await prisma.inventory.update({ where: { id: existing.id }, data })
      : await prisma.inventory.create({ data });

    for (let index = 0; index < itemColors.length; index += 1) {
      await prisma.inventoryStock.upsert({
        where: {
          inventoryId_stationId_colorId: {
            inventoryId: inventory.id,
            stationId: stations["Main Store"].id,
            colorId: colors[itemColors[index]].id,
          },
        },
        update: { qty: quantities[index] },
        create: {
          inventoryId: inventory.id,
          stationId: stations["Main Store"].id,
          colorId: colors[itemColors[index]].id,
          qty: quantities[index],
        },
      });
    }
  }

  const [vendorsList, inventoriesList, departmentsList, colorsList] = await Promise.all([
    prisma.vendor.findMany(),
    prisma.inventory.findMany(),
    prisma.department.findMany(),
    prisma.color.findMany(),
  ]);

  return {
    vendors: Object.fromEntries(vendorsList.map((vendor) => [vendor.vendorName, vendor])),
    inventories: Object.fromEntries(inventoriesList.map((inventory) => [inventory.itemName, inventory])),
    departments: Object.fromEntries(departmentsList.map((department) => [department.name, department])),
    colors: Object.fromEntries(colorsList.map((color) => [color.name, color])),
  };
}

const ensureMovement = async ({ date, inventoryId, qty, sourceType, sourceId, note, actorId }) => {
  const existing = await prisma.stockMovement.findFirst({
    where: { sourceType, sourceId, inventoryId },
  });
  if (existing) {
    await prisma.stockMovement.update({
      where: { id: existing.id },
      data: { date, qty, note },
    });
  } else {
    await prisma.stockMovement.create({
      data: { date, inventoryId, qty, sourceType, sourceId, note, createdById: actorId },
    });
  }
};

async function seedTransactions(actorId, masterData) {
  const vendor = masterData.vendors["Pak Auto Components"];
  const engineOil = masterData.inventories["Engine Oil 20W-50"];
  const airFilter = masterData.inventories["Air Filter 70cc"];
  const sparkPlug = masterData.inventories["Spark Plug"];
  const frontMudguard = masterData.inventories["Front Mudguard"];
  const rearMudguard = masterData.inventories["Rear Mudguard"];
  const brakeShoe = masterData.inventories["Brake Shoe Set"];
  const chainSprocket = masterData.inventories["Chain Sprocket Kit"];
  const production = masterData.departments["Production Line"];
  const black = masterData.colors["Pearl Black"];
  const today = new Date();
  today.setHours(9, 0, 0, 0);
  const transactionDate = new Date(today);
  const inwardDate = new Date(today);
  inwardDate.setHours(10, 0, 0, 0);
  const storeIssueDate = new Date(today);
  storeIssueDate.setHours(11, 0, 0, 0);
  const itemReturnDate = new Date(today);
  itemReturnDate.setHours(12, 0, 0, 0);
  const saleGatePassDate = new Date(today);
  saleGatePassDate.setHours(13, 0, 0, 0);

  let quotation = await prisma.quotation.findFirst({
    where: { vendorId: vendor.id, remarks: "Seed quotation - motorcycle spare parts" },
  });
  if (!quotation) {
    quotation = await prisma.quotation.create({
      data: {
        date: transactionDate,
        vendorId: vendor.id,
        remarks: "Seed quotation - motorcycle spare parts",
        itemName: [engineOil.itemName, airFilter.itemName, sparkPlug.itemName],
        oldRate: [1200, 450, 330],
        proposedRate: [1280, 490, 360],
        approvedRate: [1250, 480, 350],
        createdById: actorId,
        updatedById: actorId,
      },
    });
  }
  await prisma.quotation.update({
    where: { id: quotation.id },
    data: { date: transactionDate, updatedById: actorId },
  });

  let purchaseOrder = await prisma.purchaseOrder.findFirst({
    where: { vendorId: vendor.id, instruction: "Seed PO - deliver to main store" },
  });
  if (!purchaseOrder) {
    const itemNames = [engineOil.itemName, airFilter.itemName, sparkPlug.itemName];
    const quantities = [100, 80, 120];
    const rates = [1250, 480, 350];
    const amounts = quantities.map((quantity, index) => quantity * rates[index]);
    const total = amounts.reduce((sum, amount) => sum + amount, 0);
    const saleTaxPercent = 18;
    const totalWithSaleTax = total + Math.round((total * saleTaxPercent) / 100);
    const withHoldingPercent = 2;
    const withHoldingAmount = Math.round((totalWithSaleTax * withHoldingPercent) / 100);

    purchaseOrder = await prisma.purchaseOrder.create({
      data: {
        date: transactionDate,
        vendorId: vendor.id,
        validity: "30 days",
        instruction: "Seed PO - deliver to main store",
        quotationId: quotation.id,
        code: [engineOil.id, airFilter.id, sparkPlug.id],
        itemName: itemNames,
        unit: [1, 1, 1],
        quantity: quantities,
        rate: rates,
        amount: amounts,
        total,
        saleTaxPercent,
        totalWithSaleTax,
        withHoldingPercent,
        withHoldingAmount,
        grandTotal: totalWithSaleTax - withHoldingAmount,
        createdById: actorId,
        updatedById: actorId,
      },
    });
  }
  await prisma.purchaseOrder.update({
    where: { id: purchaseOrder.id },
    data: { date: transactionDate, updatedById: actorId },
  });

  let inward = await prisma.inward.findFirst({ where: { GRIRNo: 1001 } });
  if (!inward) {
    inward = await prisma.inward.create({
      data: {
        date: inwardDate,
        Type: "againstPO",
        purchaseOrderId: purchaseOrder.id,
        quotationId: quotation.id,
        GRIRNo: 1001,
        DCNo: 4501,
        billNO: 7801,
        detail: "Seed inward received against purchase order",
        createdById: actorId,
        updatedById: actorId,
        items: {
          create: [
            { inventoryId: engineOil.id, poBalQty: 100, recQty: 100, rejQty: 2, okQty: 98, packingDetail: "Cartons" },
            { inventoryId: airFilter.id, poBalQty: 80, recQty: 80, rejQty: 0, okQty: 80, packingDetail: "Boxes" },
            { inventoryId: sparkPlug.id, poBalQty: 120, recQty: 120, rejQty: 3, okQty: 117, packingDetail: "Boxes" },
          ],
        },
      },
    });
  }
  await prisma.inward.update({
    where: { id: inward.id },
    data: { date: inwardDate, updatedById: actorId },
  });
  for (const [inventory, qty] of [
    [engineOil, 98],
    [airFilter, 80],
    [sparkPlug, 117],
  ]) {
    await ensureMovement({
      date: inwardDate,
      inventoryId: inventory.id,
      qty,
      sourceType: "INWARD",
      sourceId: inward.id,
      note: `Inward #${inward.id} (GRIR ${inward.GRIRNo})`,
      actorId,
    });
  }

  let storeIssue = await prisma.storeIssue.findFirst({
    where: { departmentId: production.id, colorId: black.id, bikeQty: 4 },
  });
  if (!storeIssue) {
    storeIssue = await prisma.storeIssue.create({
      data: {
        date: storeIssueDate,
        departmentId: production.id,
        colorId: black.id,
        bikeQty: 4,
        createdById: actorId,
        updatedById: actorId,
        items: {
          create: [
            { inventoryId: frontMudguard.id, upm: frontMudguard.unitPerBike, handStock: 150, issueQty: 4, purpose: "Chassis Assembly" },
            { inventoryId: rearMudguard.id, upm: rearMudguard.unitPerBike, handStock: 150, issueQty: 4, purpose: "Chassis Assembly" },
            { inventoryId: brakeShoe.id, upm: brakeShoe.unitPerBike, handStock: 400, issueQty: 8, purpose: "Chassis Assembly" },
          ],
        },
      },
    });
  }
  await prisma.storeIssue.update({
    where: { id: storeIssue.id },
    data: { date: storeIssueDate, updatedById: actorId },
  });
  for (const [inventory, qty] of [
    [frontMudguard, 4],
    [rearMudguard, 4],
    [brakeShoe, 8],
  ]) {
    await ensureMovement({
      date: storeIssueDate,
      inventoryId: inventory.id,
      qty: -qty,
      sourceType: "STORE_ISSUE",
      sourceId: storeIssue.id,
      note: `Store Issuance #${storeIssue.id}`,
      actorId,
    });
  }

  let itemReturn = await prisma.itemReturn.findFirst({
    where: { departmentId: production.id },
  });
  if (!itemReturn) {
    itemReturn = await prisma.itemReturn.create({
      data: {
        date: itemReturnDate,
        departmentId: production.id,
        createdById: actorId,
        updatedById: actorId,
        items: {
          create: [
            { inventoryId: frontMudguard.id, recvdQty: 1, purpose: "Unused part returned from assembly" },
            { inventoryId: brakeShoe.id, recvdQty: 2, purpose: "Unused parts returned from assembly" },
          ],
        },
      },
    });
  }
  await prisma.itemReturn.update({
    where: { id: itemReturn.id },
    data: { date: itemReturnDate, updatedById: actorId },
  });
  for (const [inventory, qty] of [
    [frontMudguard, 1],
    [brakeShoe, 2],
  ]) {
    await ensureMovement({
      date: itemReturnDate,
      inventoryId: inventory.id,
      qty,
      sourceType: "ITEM_RETURN",
      sourceId: itemReturn.id,
      note: `Item Return #${itemReturn.id}`,
      actorId,
    });
  }

  let saleGatePass = await prisma.saleGatePass.findFirst({
    where: { accountName: "Lahore Motors", billNO: 5001 },
  });
  if (!saleGatePass) {
    saleGatePass = await prisma.saleGatePass.create({
      data: {
        date: saleGatePassDate,
        accountName: "Lahore Motors",
        billNO: 5001,
        throughBy: "Bilal Ahmed",
        remarks: "Seed sale gate pass",
        vehicleNo: "LEA-26-5001",
        createdById: actorId,
        updatedById: actorId,
        items: {
          create: [
            { inventoryId: chainSprocket.id, unit: "Set", stockInHand: 250, qty: 5 },
            { inventoryId: engineOil.id, unit: "Bottle", stockInHand: 500, qty: 10 },
          ],
        },
      },
    });
  }
  await prisma.saleGatePass.update({
    where: { id: saleGatePass.id },
    data: { date: saleGatePassDate, updatedById: actorId },
  });
  for (const [inventory, qty] of [
    [chainSprocket, -5],
    [engineOil, -10],
  ]) {
    await ensureMovement({
      date: saleGatePassDate,
      inventoryId: inventory.id,
      qty,
      sourceType: "SALE_GATE_PASS",
      sourceId: saleGatePass.id,
      note: `Sale Gate Pass #${saleGatePass.id}`,
      actorId,
    });
  }
}

async function main() {
  const permissions = await seedPermissions();
  const { adminUser, email, password } = await seedAdmin();
  const masterData = await seedMasterData(adminUser.id);
  await seedTransactions(adminUser.id, masterData);

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
    await prismaLocal.$disconnect();
    if (prismaCloud && prismaCloud !== prismaLocal) {
      await prismaCloud.$disconnect();
    }
  });
