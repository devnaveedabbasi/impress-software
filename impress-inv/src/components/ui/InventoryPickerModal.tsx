"use client";

import { InfiniteViewAllModal } from "@/components/ui/InfiniteViewAllModal";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";
import { INVENTORY } from "@/utlis/apiRoutes";

export type InventoryPickItem = {
  id: number;
  itemName: string;
  categoryName: string;
  stock: number;
  departmentId?: number; // the department this item belongs to
  unitPerBike?: number; // how many of this item one bike needs
  [key: string]: unknown;
};

interface InventoryPickerModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (item: InventoryPickItem) => void;
}

const columns: ViewAllColumn<InventoryPickItem>[] = [
  { key: "id", header: "Code" },
  { key: "itemName", header: "Item Name" },
  { key: "categoryName", header: "Category" },
  { key: "stock", header: "Stock Qty" },
];

// The row of the server (an item with its category and stock rows) as the row of the picker
const toPickItem = (row: InventoryPickItem): InventoryPickItem => {
  const item = row as unknown as {
    category?: { name?: string };
    stocks?: { qty: number }[];
    stockInHand?: number;
  } & InventoryPickItem;
  return {
    ...row,
    categoryName: item.category?.name || "-",
    unitPerBike: item.unitPerBike ?? 0,
    // stockInHand already includes the stock movements (inward, gate pass, issue, return)
    stock:
      typeof item.stockInHand === "number"
        ? item.stockInHand
        : Array.isArray(item.stocks)
          ? item.stocks.reduce((sum, stock) => sum + (Number(stock.qty) || 0), 0)
          : 0,
  };
};

// Click an item cell -> this modal lists the inventory (infinite scroll, the search is done by the server on the whole
// table) -> the chosen item comes back via onSelect
export function InventoryPickerModal({
  isOpen,
  title = "Select Inventory Item",
  onClose,
  onSelect,
}: InventoryPickerModalProps) {
  return (
    <InfiniteViewAllModal<InventoryPickItem>
      isOpen={isOpen}
      title={title}
      endpoint={INVENTORY}
      name="inventory"
      columns={columns}
      mapRow={toPickItem}
      hideActions
      emptyMessage="No inventory items found. Add items in Master Entries > Inventory."
      onClose={onClose}
      onRowSelect={onSelect}
    />
  );
}
