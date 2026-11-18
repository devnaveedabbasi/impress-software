import { COMPANY_NAME } from "@/lib/company";

export default function Home() {
  return (
    <div className="rounded-3xl bg-white p-8 shadow-sm">
      <h1 className="text-xl font-semibold text-zinc-900">{COMPANY_NAME}</h1>
      <p className="mt-1 text-sm font-medium text-zinc-700">Inventory Management System</p>
      <p className="mt-1 text-sm text-zinc-500">
        Pick a department from the menu above to get started.
      </p>
    </div>
  );
}

