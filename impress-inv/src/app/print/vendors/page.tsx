"use client";

import { PrintableProfileList } from "@/components/print/PrintableProfileList";
import { VENDORS } from "@/utlis/apiRoutes";

export default function VendorPrintPage() {
    return (
        <PrintableProfileList
            subtitle="Vendor Profile"
            apiPath={VENDORS}
            emptyMessage="No vendors found."
            mapRecord={(v) => ({
                id: v.id,
                name: v.vendorName,
                address: v.address,
                contactNo: v.contactNo,
                saleTaxNo: v.saleTaxNo,
                NTNNo: v.NTNNo,
            })}
        />
    );
}
