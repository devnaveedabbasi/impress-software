"use client";

import { InfiniteViewAllModal } from "@/components/ui/InfiniteViewAllModal";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";
import { DEALERS } from "@/utlis/apiRoutes";

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

const toPickItem = (row: DealerPickItem): DealerPickItem => {
  const dealer = row as unknown as { dealarShipName?: string; name?: string; city?: { name?: string } } & DealerPickItem;
  return {
    ...row,
    dealerName: dealer.dealarShipName || dealer.name || `Dealer #${row.id}`,
    cityName: dealer.city?.name || "-",
    contactNo: row.contactNo || "-",
  };
};

// Click the dealer field -> this modal lists the dealers (infinite scroll, search by the server) -> the chosen
// dealer comes back via onSelect
export function DealerPickerModal({ isOpen, title = "Select Dealer", onClose, onSelect }: DealerPickerModalProps) {
  return (
    <InfiniteViewAllModal<DealerPickItem>
      isOpen={isOpen}
      title={title}
      endpoint={DEALERS}
      name="dealers"
      columns={columns}
      mapRow={toPickItem}
      hideActions
      emptyMessage="No dealers found. Add dealers in Master Entries > Dealer Profile."
      onClose={onClose}
      onRowSelect={onSelect}
    />
  );
}
