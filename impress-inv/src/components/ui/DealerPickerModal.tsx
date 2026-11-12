"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { VENDORS } from "@/utlis/apiRoutes";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

export type DealerPickItem = {
  id: number;
  dealerName: string;
  cityName: string;
  contactNo: string;
  [key: string]: unknown;
};

interface DealerPickerModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (dealer: DealerPickItem) => void;
}

const columns: ViewAllColumn<DealerPickItem>[] = [
  { key: "id", header: "ID" },
  { key: "dealerName", header: "Dealer Name" },
  { key: "cityName", header: "City" },
  { key: "contactNo", header: "Contact" },
];

// Click the dealer field -> this modal lists all dealers (with search) -> the chosen dealer comes back via onSelect
export function DealerPickerModal({ isOpen, title = "Select Dealer", onClose, onSelect }: DealerPickerModalProps) {
  const [rows, setRows] = useState<DealerPickItem[]>([]);
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
            (dealer: { id: number; dealarShipName?: string; name?: string; contactNo?: string; city?: { name?: string } }) => ({
              id: dealer.id,
              dealerName: dealer.dealarShipName || dealer.name || `Dealer #${dealer.id}`,
              cityName: dealer.city?.name || "-",
              contactNo: dealer.contactNo || "-",
            })
          )
        );
      } catch (err: unknown) {
        if (cancelled) return;
        const apiError = err as { response?: { status?: number; data?: { message?: string } }; message?: string };
        setError(
          apiError.response?.data?.message ||
            (apiError.response?.status
              ? `Failed to load dealers (HTTP ${apiError.response.status})`
              : apiError.message || "Failed to load dealers")
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
      key={isOpen ? "dealer-picker-open" : "dealer-picker-closed"}
      isOpen={isOpen}
      title={title}
      rows={rows}
      columns={columns}
      searchKeys={["id", "dealerName", "cityName", "contactNo"]}
      isLoading={isLoading && rows.length === 0}
      error={
        error ||
        (!isLoading && rows.length === 0 ? "No dealers found. Add dealers in Master Entries > Dealer." : "")
      }
      onClose={onClose}
      onRowSelect={onSelect}
    />
  );
}
