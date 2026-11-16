"use client";

import { StoreReport } from "@/components/reports/StoreReport";
import { STORE_REPORTS } from "@/lib/storeReports";

export default function Page() {
    return <StoreReport def={STORE_REPORTS["stock-ledger"]} />;
}
