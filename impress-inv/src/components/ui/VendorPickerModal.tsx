"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { VENDORS } from "@/utlis/apiRoutes";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

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

// Click the vendor field -> this modal lists all vendors (with search) -> the chosen vendor comes back via onSelect
export function VendorPickerModal({ isOpen, title = "Select Vendor", onClose, onSelect }: VendorPickerModalProps) {
  const [rows, setRows] = useState<VendorPickItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get(VENDORS);
        if (cancelled) return;
        setRows(
          (data.data || []).map(
            (vendor: { id: number; vendorName?: string; contactNo?: string; city?: { name?: string } }) => ({
              id: vendor.id,
              vendorName: vendor.vendorName || `Vendor #${vendor.id}`,
              cityName: vendor.city?.name || "-",
              contactNo: vendor.contactNo || "-",
            })
          )
        );
      } catch (err: unknown) {
        if (cancelled) return;
        const apiError = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
        setError(
          apiError.response?.data?.message ||
            (apiError.response?.status
              ? `Failed to load vendors (HTTP ${apiError.response.status})`
              : apiError.message || "Failed to load vendors")
        );
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  return (
    <ViewAllModal
      key={isOpen ? "vendor-picker-open" : "vendor-picker-closed"}
      isOpen={isOpen}
      title={title}
      rows={rows}
      columns={columns}
      searchKeys={["id", "vendorName", "cityName", "contactNo"]}
      isLoading={isLoading && rows.length === 0}
      error={
        error ||
        (!isLoading && rows.length === 0 ? "No vendors found. Add vendors in Master Entries > Vendor." : "")
      }
      onClose={onClose}
      onRowSelect={onSelect}
    />
  );
}
