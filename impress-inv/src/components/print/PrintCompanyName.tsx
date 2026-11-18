import { COMPANY_NAME } from "@/lib/company";

// The company name at the top of a printed paper (every list, slip and report), in the style of the Inventory print.
// The name is set in lib/company.ts.
export function PrintCompanyName() {
  return <h1 className="text-center text-2xl font-bold uppercase tracking-wide text-black">{COMPANY_NAME}</h1>;
}
