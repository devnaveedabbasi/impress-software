import * as z from "zod";

export const provinceSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Province Name is required" }),
});

export type ProvinceFormValues = z.infer<typeof provinceSchema>;

export const citySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "City Name is required" }),
  provinceId: z.string().min(1, { message: "Province is required" }),
});

export type CityFormValues = z.infer<typeof citySchema>;

export const stationSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Station Name is required" }),
});

export type StationFormValues = z.infer<typeof stationSchema>;

export const categorySchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Category Name is required" }),
});

export type CategoryFormValues = z.infer<typeof categorySchema>;

export const colorSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, { message: "Color Name is required" })
    .max(50, { message: "Color Name is too long" }),
});

export type ColorFormValues = z.infer<typeof colorSchema>;

export const departmentSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, { message: "Department Name is required" }),
});

export type DepartmentFormValues = z.infer<typeof departmentSchema>;

// Numeric value carried as a string (form inputs are always strings), with a min/max range check.
const numericRange = (label: string, min: number, max: number) =>
  z
    .string()
    .min(1, { message: `${label} is required` })
    .refine((v) => !Number.isNaN(Number(v)), { message: `${label} must be a valid number` })
    .refine((v) => Number(v) >= min, { message: `${label} must be at least ${min}` })
    .refine((v) => Number(v) <= max, { message: `${label} must be at most ${max}` });

export const vendorSchema = z.object({
  id: z.string().optional(),
  vendorName: z
    .string()
    .trim()
    .min(2, { message: "Vendor Name must be at least 2 characters" })
    .max(100, { message: "Vendor Name must be at most 100 characters" }),
  address: z
    .string()
    .trim()
    .min(5, { message: "Address must be at least 5 characters" })
    .max(255, { message: "Address must be at most 255 characters" }),
  provinceId: z.string().min(1, { message: "Province is required" }),
  cityId: z.string().min(1, { message: "City is required" }),
  contactNo: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,15}$/, { message: "Enter a valid contact number (7-15 digits)" }),
  saleTaxNo: z
    .string()
    .trim()
    .min(3, { message: "Sale Tax No must be at least 3 characters" })
    .max(20, { message: "Sale Tax No must be at most 20 characters" }),
  NICNo: z
    .string()
    .trim()
    .min(5, { message: "N.I.C No must be at least 5 characters" })
    .max(20, { message: "N.I.C No must be at most 20 characters" }),
  mobileNo: z
    .string()
    .trim()
    .regex(/^(\+92|0)?3\d{9}$/, { message: "Enter a valid mobile number (e.g. 03001234567)" }),
  daysLimit: numericRange("Days Limit", 0, 365),
  amoutLimit: numericRange("Account Limit", 0, 100_000_000),
  NTNNo: z
    .string()
    .trim()
    .min(5, { message: "NTN No is required" }),
  openingBalance: numericRange("Opening Balance", -100_000_000, 1_000_000_000),
  CNICNo: z
    .string()
    .trim()
    .regex(/^\d{5}-\d{7}-\d{1}$|^\d{13}$/, { message: "Enter a valid CNIC (e.g. 12345-1234567-1)" }),
});

export type VendorFormValues = z.infer<typeof vendorSchema>;

export const dealerSchema = z.object({
  id: z.string().optional(),
  dealarShipName: z
    .string()
    .trim()
    .min(2, { message: "Dealership Name must be at least 2 characters" })
    .max(100, { message: "Dealership Name must be at most 100 characters" }),
  name: z
    .string()
    .trim()
    .min(2, { message: "Name must be at least 2 characters" })
    .max(100, { message: "Name must be at most 100 characters" }),
  address: z
    .string()
    .trim()
    .min(5, { message: "Address must be at least 5 characters" })
    .max(255, { message: "Address must be at most 255 characters" }),
  provinceId: z.string().min(1, { message: "Province is required" }),
  cityId: z.string().min(1, { message: "City is required" }),
  contactNo: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s]{7,15}$/, { message: "Enter a valid contact number (7-15 digits)" }),
  saleTaxNo: z
    .string()
    .trim()
    .min(3, { message: "Sale Tax No must be at least 3 characters" })
    .max(20, { message: "Sale Tax No must be at most 20 characters" }),
  NTNNo: z
    .string()
    .trim()
    .min(5, { message: "NTN No is required" }),
  mobileNo: z
    .string()
    .trim()
    .regex(/^(\+92|0)?3\d{9}$/, { message: "Enter a valid mobile number (e.g. 03001234567)" }),
  NICNo: z
    .string()
    .trim()
    .regex(/^\d{5}-\d{7}-\d{1}$|^\d{13}$/, { message: "Enter a valid NIC/CNIC (e.g. 12345-1234567-1)" }),
  dealarType: z.enum(["single", "dealar"], { message: "Select a dealer type" }),
  opeaningBalance: numericRange("Opening Balance", -100_000_000, 1_000_000_000),
});

export type DealerFormValues = z.infer<typeof dealerSchema>;

export const inventorySchema = z.object({
  id: z.string().optional(),
  itemName: z
    .string()
    .trim()
    .min(2, { message: "Item Name must be at least 2 characters" })
    .max(200, { message: "Item Name must be at most 200 characters" }),
  categoryId: z.string().min(1, { message: "Category is required" }),
  departmentId: z.string().min(1, { message: "Department is required" }),
  pack: numericRange("Pack", 1, 100_000),
  rate: numericRange("Rate", 0, 100_000_000),
  unitPerBike: numericRange("Unit Per Bike", 0, 10_000),
  colorRows: z
    .array(
      z.object({
        stationId: z.string().optional(),
        colorId: z.string().optional(), // id from the Color master table
        qty: z.string().optional(),
      })
    )
    .superRefine((rows, ctx) => {
      const keys = rows
        .filter((row) => row.stationId && row.colorId)
        .map((row) => `${row.stationId}:${row.colorId}`);
      if (keys.length !== new Set(keys).size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The same Station + Color combination cannot be added twice",
        });
      }
    }),
});

export type InventoryFormValues = z.infer<typeof inventorySchema>;

export const quotationSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, { message: "Date is required" }),
  vendorId: z.string().min(1, { message: "Vendor is required" }),
  remarks: z
    .string()
    .trim()
    .min(1, { message: "Remarks are required" })
    .max(255, { message: "Remarks must be at most 255 characters" }),
  items: z
    .array(
      z.object({
        itemName: z.string().trim().optional().or(z.literal("")),
        oldRate: z.string().optional().or(z.literal("")),
        proposedRate: z.string().optional().or(z.literal("")),
        approvedRate: z.string().optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let hasCompleteRow = false;
      let hasPartialRow = false;

      for (const row of items) {
        const hasAny = !!(row.itemName || row.oldRate || row.proposedRate || row.approvedRate);
        const hasAll = !!(row.itemName && row.oldRate && row.proposedRate && row.approvedRate);

        if (hasAll) hasCompleteRow = true;
        if (hasAny && !hasAll) hasPartialRow = true;
      }

      if (!hasCompleteRow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please fill at least one complete row (Item Name, Old Rate, Proposed Rate, Approved Rate)",
        });
      } else if (hasPartialRow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please complete all fields in partially filled rows, or leave them completely blank",
        });
      }
    }),
});

export type QuotationFormValues = z.infer<typeof quotationSchema>;

export const purchaseOrderSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, { message: "Date is required" }),
  vendorId: z.string().min(1, { message: "Vendor is required" }),
  validity: z.string().min(1, { message: "Validity is required" }),
  instruction: z
    .string()
    .trim()
    .min(1, { message: "Instruction is required" })
    .max(255, { message: "Instruction must be at most 255 characters" }),
  quotationId: z.string().min(1, { message: "Quotation is required" }),
  items: z
    .array(
      z.object({
        code: z.string().optional().or(z.literal("")),
        itemName: z.string().trim().optional().or(z.literal("")),
        unit: z.string().optional().or(z.literal("")),
        quantity: z.string().optional().or(z.literal("")),
        rate: z.string().optional().or(z.literal("")),
        amount: z.string().optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let hasCompleteRow = false;
      let hasPartialRow = false;

      for (const row of items) {
        const hasAny = !!(row.code || row.itemName || row.unit || row.quantity || row.rate || row.amount);
        const hasAll = !!(row.code && row.itemName && row.unit && row.quantity && row.rate && row.amount);

        if (hasAll) hasCompleteRow = true;
        if (hasAny && !hasAll) hasPartialRow = true;
      }

      if (!hasCompleteRow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please fill at least one complete row",
        });
      } else if (hasPartialRow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please complete all fields in partially filled rows, or leave them completely blank",
        });
      }

      // Check for unique codes
      const codes = items.map(r => r.code).filter(c => c && c.trim() !== "");
      const uniqueCodes = new Set(codes);
      if (codes.length !== uniqueCodes.size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each Code must be unique across the rows",
        });
      }
    }),
    
  total: z.string().optional(),
  saleTaxPercent: z.string().optional(),
  totalWithSaleTax: z.string().optional(),
  withHoldingPercent: z.string().optional(),
  withHoldingAmount: z.string().optional(),
  grandTotal: z.string().optional(),
});

export type PurchaseOrderFormValues = z.infer<typeof purchaseOrderSchema>;

export const inwardSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, { message: "Date is required" }),
  Type: z.enum(["againstSimple", "againstPO", "againstDealarRejection"]),
  purchaseOrderId: z.string().optional(),
  quotationId: z.string().optional(),
  GRIRNo: z.string().min(1, { message: "G.R.LR No is required" }),
  DCNo: z.string().min(1, { message: "DC No is required" }),
  billNO: z.string().optional(),
  detail: z
    .string()
    .trim()
    .min(1, { message: "Details are required" })
    .min(3, { message: "Details must be at least 3 characters" })
    .max(255, { message: "Details must be at most 255 characters" }),
  name: z.string().optional(), // Vendor name fetched from PO
  items: z
    .array(
      z.object({
        // Linked Inventory item id (shown as "Code") — set only by picking from the inventory modal
        inventoryId: z.string().optional().or(z.literal("")),
        itemName: z.string().trim().optional().or(z.literal("")),
        poBalQty: z.string().optional().or(z.literal("")),
        recQty: z.string().optional().or(z.literal("")),
        rejQty: z.string().optional().or(z.literal("")),
        okQty: z.string().optional().or(z.literal("")),
        packingDetail: z.string().optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let hasCompleteRow = false;

      for (const [index, row] of items.entries()) {
        const hasAny = !!(row.inventoryId || row.itemName || row.recQty || row.rejQty || row.packingDetail);
        if (!hasAny) continue;

        if (!row.inventoryId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Row ${index + 1}: "${row.itemName || "item"}" is not linked to inventory — click Item Name and select it from the list`,
          });
          return;
        }
        if (!row.recQty || Number(row.recQty) < 1) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Row ${index + 1}: Rec Qty is required`,
          });
          return;
        }
        if (Number(row.poBalQty) > 0 && Number(row.recQty) > Number(row.poBalQty)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Row ${index + 1}: Rec Qty cannot be more than PO Bal Qty (${row.poBalQty})`,
          });
          return;
        }
        if ((Number(row.rejQty) || 0) > Number(row.recQty)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: `Row ${index + 1}: REJ Qty cannot be greater than Rec Qty`,
          });
          return;
        }
        hasCompleteRow = true;
      }

      if (!hasCompleteRow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please add at least one item (select Item Name and enter Rec Qty)",
        });
        return;
      }

      const ids = items.map((r) => r.inventoryId).filter(Boolean);
      if (ids.length !== new Set(ids).size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "The same inventory item cannot be added twice",
        });
      }
    }),
});

export type InwardFormValues = z.infer<typeof inwardSchema>;

export const accountCodeSchema = z.object({
  id: z.string().optional(),
  headName: z.string().min(1, { message: "Head Name is required" }),
  group: z.string().min(1, { message: "Group is required" }),
  items: z
    .array(
      z.object({
        code: z.string().optional().or(z.literal("")),
        name: z.string().trim()
          .min(2, { message: "Name must be at least 2 characters" })
          .max(100, { message: "Name is too long" })
          .optional().or(z.literal("")),
        address: z.string().trim()
          .min(5, { message: "Address must be at least 5 characters" })
          .max(255)
          .optional().or(z.literal("")),
        contactNo: z.string().trim()
          .regex(/^[0-9+\-\s]{7,15}$/, { message: "Enter a valid contact number (7-15 digits)" })
          .optional().or(z.literal("")),
        saleTaxNo: z.string().trim()
          .min(3, { message: "Sale Tax No must be at least 3 characters" })
          .max(20)
          .optional().or(z.literal("")),
        openingBalance: z.string().optional().refine((v) => !v || !Number.isNaN(Number(v)), { message: "Valid number required" }),
      })
    )
    .superRefine((items, ctx) => {
      let hasCompleteRow = false;
      let hasPartialRow = false;

      for (const row of items) {
        const hasAny = !!(row.code || row.name || row.address || row.contactNo || row.saleTaxNo || row.openingBalance);
        const hasRequired = !!(row.code && row.name);

        if (hasRequired) hasCompleteRow = true;
        if (hasAny && !hasRequired) hasPartialRow = true;
      }

      if (!hasCompleteRow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please fill at least one row (Code and Name are required)",
        });
      } else if (hasPartialRow) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please complete Code and Name for all partially filled rows, or leave them completely blank",
        });
      }
    }),
});

export type AccountCodeFormValues = z.infer<typeof accountCodeSchema>;


// ---- Shared rules for the gate pass forms ----
const MAX_ITEM_QTY = 1_000_000;

// Today in the user's own time zone (a date input gives the local date)
const localToday = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().split("T")[0];
};

const pastOrTodayDate = z
  .string()
  .min(1, { message: "Date is required" })
  .refine((value) => value <= localToday(), { message: "Date cannot be in the future" });

// Row quantity: a whole number from 1 up to MAX_ITEM_QTY, written by the user as text
const checkRowQty = (value: string | undefined, label: string): string => {
  if (!value) return `${label} is required`;
  if (!/^\d+$/.test(value)) return `${label} must be a whole number`;
  const number = Number(value);
  if (number < 1) return `${label} must be at least 1`;
  if (number > MAX_ITEM_QTY) return `${label} cannot be more than ${MAX_ITEM_QTY.toLocaleString()}`;
  return "";
};

const optionalCode = (label: string) =>
  z
    .string()
    .trim()
    .max(50, { message: `${label} must be at most 50 characters` })
    .optional()
    .refine((value) => !value || /^[A-Za-z0-9\-\/ ]+$/.test(value), {
      message: `${label} can only have letters, numbers, spaces, - and /`,
    });

export const saleGatePassSchema = z.object({
  id: z.string().optional(),
  date: pastOrTodayDate,
  accountName: z
    .string()
    .trim()
    .min(2, { message: "Account Name must be at least 2 characters" })
    .max(100, { message: "Account Name must be at most 100 characters" }),
  billNO: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || /^\d{1,9}$/.test(value), { message: "Bill No must be a number (up to 9 digits)" }),
  throughBy: z
    .string()
    .trim()
    .max(100, { message: "Through By must be at most 100 characters" })
    .optional()
    .refine((value) => !value || value.length >= 2, { message: "Through By must be at least 2 characters" }),
  remarks: z.string().trim().max(255, { message: "Remarks must be at most 255 characters" }).optional(),
  vehicleNo: z
    .string()
    .trim()
    .max(20, { message: "Vehicle No must be at most 20 characters" })
    .optional()
    .refine((value) => !value || /^[A-Za-z0-9][A-Za-z0-9\- ]*$/.test(value), {
      message: "Vehicle No can only have letters, numbers, spaces and -",
    }),
  items: z
    .array(
      z.object({
        // Linked Inventory item id (shown as "Code"), set only by picking from the inventory modal
        inventoryId: z.string().optional().or(z.literal("")),
        itemName: z.string().trim().optional().or(z.literal("")),
        unit: z.string().trim().max(20, { message: "Unit must be at most 20 characters" }).optional().or(z.literal("")),
        stockInHand: z.string().optional().or(z.literal("")),
        qty: z.string().optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let completeRows = 0;
      const seen = new Map<string, number>();

      items.forEach((row, index) => {
        const hasAny = !!(row.inventoryId || row.itemName || row.unit || row.qty);
        if (!hasAny) return;

        if (!row.inventoryId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "inventoryId"],
            message: "click Item Name and select the item from the list",
          });
          return;
        }
        const qtyError = checkRowQty(row.qty, "Qty");
        if (qtyError) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "qty"], message: qtyError });
          return;
        }
        if (seen.has(row.inventoryId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "inventoryId"],
            message: `"${row.itemName}" is already added in row ${(seen.get(row.inventoryId) as number) + 1}`,
          });
          return;
        }
        seen.set(row.inventoryId, index);
        completeRows++;
      });

      // Only when every row is empty: if rows have data, their own problems are reported instead
      if (completeRows === 0 && !items.some((row) => Object.values(row).some(Boolean))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please add at least one item (select Item Name and enter Qty)",
        });
      }
    }),
});

export type SaleGatePassFormValues = z.infer<typeof saleGatePassSchema>;


export const rejectionReturnToVendorSchema = z.object({
  id: z.string().optional(), // the Claim Note No (generated automatically)
  date: pastOrTodayDate,
  vendorId: z.string().min(1, { message: "Please select a vendor" }),
  vendorName: z.string().optional(), // only shown on the form, the vendor is saved by id
  address: z
    .string()
    .trim()
    .min(5, { message: "Address must be at least 5 characters" })
    .max(255, { message: "Address must be at most 255 characters" }),
  contactNo: z
    .string()
    .trim()
    .min(1, { message: "Contact No is required" })
    .max(100, { message: "Contact No must be at most 100 characters" })
    .regex(/^[0-9+\-\s,()\/]{5,}$/, {
      message: "Enter a valid contact number (digits, spaces and + - , ( ) only, at least 5 characters)",
    }),
  saleTaxNo: z
    .string()
    .trim()
    .min(3, { message: "Sale Tax No must be at least 3 characters" })
    .max(50, { message: "Sale Tax No must be at most 50 characters" })
    .regex(/^[A-Za-z0-9\-\/ ]+$/, { message: "Sale Tax No can only have letters, numbers, spaces, - and /" }),
  transport: z
    .string()
    .trim()
    .min(2, { message: "Transport must be at least 2 characters" })
    .max(100, { message: "Transport must be at most 100 characters" }),
  builtyNo: optionalCode("Builty No"),
  bookNo: optionalCode("Book No"),
  receivedBy: z
    .string()
    .trim()
    .min(2, { message: "Received By must be at least 2 characters" })
    .max(100, { message: "Received By must be at most 100 characters" }),
  items: z
    .array(
      z.object({
        // Linked Inventory item id (shown as "Code"), set only by picking from the inventory modal
        inventoryId: z.string().optional().or(z.literal("")),
        itemName: z.string().trim().optional().or(z.literal("")),
        rej: z.string().optional().or(z.literal("")),
        report: z.string().trim().max(255, { message: "Report must be at most 255 characters" }).optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let completeRows = 0;
      const seen = new Map<string, number>();

      items.forEach((row, index) => {
        const hasAny = !!(row.inventoryId || row.itemName || row.rej || row.report);
        if (!hasAny) return;

        if (!row.inventoryId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "inventoryId"],
            message: "click Item Name and select the item from the list",
          });
          return;
        }
        const rejError = checkRowQty(row.rej, "Rej");
        if (rejError) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "rej"], message: rejError });
          return;
        }
        if (seen.has(row.inventoryId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "inventoryId"],
            message: `"${row.itemName}" is already added in row ${(seen.get(row.inventoryId) as number) + 1}`,
          });
          return;
        }
        seen.set(row.inventoryId, index);
        completeRows++;
      });

      // Only when every row is empty: if rows have data, their own problems are reported instead
      if (completeRows === 0 && !items.some((row) => Object.values(row).some(Boolean))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please add at least one item (select Item Name and enter Rej)",
        });
      }
    }),
});

export type RejectionReturnToVendorFormValues = z.infer<typeof rejectionReturnToVendorSchema>;

// ---------------- Store Issuance (Issue from Line) ----------------
export const storeIssueSchema = z.object({
  id: z.string().optional(), // the Requisition Slip No (generated automatically)
  date: pastOrTodayDate,
  departmentId: z.string().min(1, { message: "Please select a department" }),
  colorId: z.string().min(1, { message: "Please select a color" }),
  bikeQty: z.string().superRefine((value, ctx) => {
    const message = checkRowQty(value, "Bike Qty");
    if (message) ctx.addIssue({ code: z.ZodIssueCode.custom, message });
  }),
  items: z
    .array(
      z.object({
        // Linked Inventory item id (shown as "Code"), set only by picking from the inventory modal
        inventoryId: z.string().optional().or(z.literal("")),
        itemName: z.string().trim().optional().or(z.literal("")),
        upm: z.string().optional().or(z.literal("")),
        handStock: z.string().optional().or(z.literal("")),
        issueQty: z.string().optional().or(z.literal("")),
        purpose: z.string().trim().max(100, { message: "Purpose must be at most 100 characters" }).optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let completeRows = 0;
      const seen = new Map<string, number>();

      items.forEach((row, index) => {
        const hasAny = !!(row.inventoryId || row.itemName || row.issueQty);
        if (!hasAny) return;

        if (!row.inventoryId) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "inventoryId"],
            message: "click Item Description and select the item from the list",
          });
          return;
        }
        const qtyError = checkRowQty(row.issueQty, "Issue Qty");
        if (qtyError) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: [index, "issueQty"], message: qtyError });
          return;
        }
        if (seen.has(row.inventoryId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [index, "inventoryId"],
            message: `"${row.itemName}" is already added in row ${(seen.get(row.inventoryId) as number) + 1}`,
          });
          return;
        }
        seen.set(row.inventoryId, index);
        completeRows++;
      });

      // Only when every row is empty: if rows have data, their own problems are reported instead
      if (completeRows === 0 && !items.some((row) => Object.values(row).some(Boolean))) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Please add at least one item (select Item Description and enter Issue Qty)",
        });
      }
    }),
});

export type StoreIssueFormValues = z.infer<typeof storeIssueSchema>;
