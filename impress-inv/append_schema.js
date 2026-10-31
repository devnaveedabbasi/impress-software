const fs = require('fs');
const path = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/lib/validations/master.ts';
let content = fs.readFileSync(path, 'utf8');

const schema = `
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
`;

if (!content.includes('saleGatePassSchema')) {
  fs.appendFileSync(path, '\n' + schema);
  console.log('Appended schema');
} else {
  console.log('Schema already exists');
}
