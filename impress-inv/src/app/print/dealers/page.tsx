"use client";

import { PrintableProfileList } from "@/components/print/PrintableProfileList";
import { DEALERS } from "@/utlis/apiRoutes";

export default function DealerPrintPage() {
    return (
        <PrintableProfileList
            subtitle="Dealer Profile"
            apiPath={DEALERS}
            emptyMessage="No dealers found."
            mapRecord={(d) => ({
                id: d.id,
                name: d.dealarShipName,
                address: d.address,
                contactNo: d.contactNo,
                saleTaxNo: d.saleTaxNo,
                NTNNo: d.NTNNo,
            })}
        />
    );
}
