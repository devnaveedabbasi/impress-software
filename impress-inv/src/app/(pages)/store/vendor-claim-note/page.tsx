"use client";

import { RejectionReturnToVendorForm } from "@/components/store/RejectionReturnToVendorForm";

// Vendor Claim Note: the claim (rate, sales tax, total) of the rejected parts that go back to a vendor.
// It is the same document as the Rejection Return to Vendor gate pass, shown with the claim note title and print.
export default function VendorClaimNotePage() {
    return <RejectionReturnToVendorForm title="Vendor Claim Note" printAs="claim" />;
}
