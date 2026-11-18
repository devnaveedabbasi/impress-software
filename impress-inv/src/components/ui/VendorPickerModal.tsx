"use client";

import { InfiniteViewAllModal } from "@/components/ui/InfiniteViewAllModal";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";
import { VENDORS } from "@/utlis/apiRoutes";

export type VendorPickItem = {
  id: number;
  vendorName: string;
  cityName: string;
  contactNo: string;
  [key: string]: unknown;
};

interface VendorPickerModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (vendor: VendorPickItem) => void;
}

const columns: ViewAllColumn<VendorPickItem>[] = [
  { key: "id", header: "ID" },
  { key: "vendorName", header: "Vendor Name" },
  { key: "cityName", header: "City" },
  { key: "contactNo", header: "Contact" },
];

const toPickItem = (row: VendorPickItem): VendorPickItem => {
  const vendor = row as unknown as { city?: { name?: string } } & VendorPickItem;
  return {
    ...row,
    vendorName: row.vendorName || `Vendor #${row.id}`,
    cityName: vendor.city?.name || "-",
    contactNo: row.contactNo || "-",
  };
};

// Click the vendor field -> this modal lists the vendors (infinite scroll, search by the server) -> the chosen
// vendor comes back via onSelect
export function VendorPickerModal({ isOpen, title = "Select Vendor", onClose, onSelect }: VendorPickerModalProps) {
  return (
    <InfiniteViewAllModal<VendorPickItem>
      isOpen={isOpen}
      title={title}
      endpoint={VENDORS}
      name="vendors"
      columns={columns}
      mapRow={toPickItem}
      hideActions
      emptyMessage="No vendors found. Add vendors in Master Entries > Vendor."
      onClose={onClose}
      onRowSelect={onSelect}
    />
  );
}
