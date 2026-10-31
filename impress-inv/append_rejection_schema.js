const fs = require('fs');
const path = 'd:/NaveedAbbasi/TRB/impress/impress-inv/src/lib/validations/master.ts';
let content = fs.readFileSync(path, 'utf8');

const schema = `
export const rejectionReturnToVendorSchema = z.object({
  id: z.string().optional(),
  claimNoteId: z.string().min(1, { message: "Claim Note ID is required" }),
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
`;

if (!content.includes('rejectionReturnToVendorSchema')) {
    fs.appendFileSync(path, '\n' + schema);
    console.log('Appended schema');
} else {
    console.log('Schema already exists');
}
