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
        color: z.string().optional(),
        qty: z.string().optional(),
      })
    ),
});

export type InventoryFormValues = z.infer<typeof inventorySchema>;

export const quotationSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, { message: "Date is required" }),
  vendorId: z.string().min(1, { message: "Vendor is required" }),
  remarks: z.string().optional(),
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
  instruction: z.string().min(1, { message: "Instruction is required" }),
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
  detail: z.string().min(1, { message: "Details are required" }),
  name: z.string().optional(), // Vendor name fetched from PO
  items: z
    .array(
      z.object({
        code: z.string().optional().or(z.literal("")),
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
      let hasPartialRow = false;

      for (const row of items) {
        const hasAny = !!(row.code || row.itemName || row.poBalQty || row.recQty || row.rejQty || row.okQty || row.packingDetail);
        const hasAll = !!(row.code && row.itemName && row.poBalQty && row.recQty && row.rejQty && row.okQty);

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

      const codes = items.map(r => r.code).filter(c => c && c.trim() !== "");
      const uniqueCodes = new Set(codes);
      if (codes.length !== uniqueCodes.size) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each Code must be unique across the rows",
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


export const saleGatePassSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, { message: "Date is required" }),
  accountName: z.string().min(1, { message: "Account Name is required" }),
  billNO: z.string().min(1, { message: "Bill No is required" }),
  throughBy: z.string().min(1, { message: "Through By is required" }),
  remarks: z.string().optional(),
  vehicleNo: z.string().min(1, { message: "Vehicle No is required" }),
  items: z
    .array(
      z.object({
        code: z.string().optional().or(z.literal("")),
        itemName: z.string().trim().optional().or(z.literal("")),
        unit: z.string().optional().or(z.literal("")),
        stockInHand: z.string().optional().or(z.literal("")),
        qty: z.string().optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let hasCompleteRow = false;
      let hasPartialRow = false;

      for (const row of items) {
        const hasAny = !!(row.code || row.itemName || row.unit || row.stockInHand || row.qty);
        const hasAll = !!(row.code && row.itemName && row.unit && row.stockInHand && row.qty);

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
    }),
});

export type SaleGatePassFormValues = z.infer<typeof saleGatePassSchema>;


export const rejectionReturnToVendorSchema = z.object({
  id: z.string().optional(),
  date: z.string().min(1, { message: "Date is required" }),
  vendorName: z.string().min(1, { message: "Vendor Name is required" }),
  address: z.string().min(1, { message: "Address is required" }),
  contactNo: z.string().min(1, { message: "Contact No is required" }),
  saleTaxNo: z.string().min(1, { message: "Sale Tax No is required" }),
  transport: z.string().min(1, { message: "Transport is required" }),
  builtyNo: z.string().min(1, { message: "Builty No is required" }),
  bookNo: z.string().min(1, { message: "Book No is required" }),
  receivedBy: z.string().min(1, { message: "Received By is required" }),
  items: z
    .array(
      z.object({
        itemName: z.string().trim().optional().or(z.literal("")),
        rej: z.string().optional().or(z.literal("")),
        report: z.string().optional().or(z.literal("")),
      })
    )
    .superRefine((items, ctx) => {
      let hasCompleteRow = false;
      let hasPartialRow = false;

      for (const row of items) {
        const hasAny = !!(row.itemName || row.rej || row.report);
        const hasAll = !!(row.itemName && row.rej && row.report);

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
    }),
});

export type RejectionReturnToVendorFormValues = z.infer<typeof rejectionReturnToVendorSchema>;
