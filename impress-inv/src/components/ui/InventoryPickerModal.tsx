"use client";

import { useEffect, useState } from "react";
import api from "@/lib/axios";
import { INVENTORY } from "@/utlis/apiRoutes";
import { ViewAllModal, type ViewAllColumn } from "@/components/ui/ViewAllModal";

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

// Click an item cell -> this modal lists the inventory (with search) -> the chosen item comes back via onSelect
export function InventoryPickerModal({
  isOpen,
  title = "Select Inventory Item",
  onClose,
  onSelect,
}: InventoryPickerModalProps) {
  const [rows, setRows] = useState<InventoryPickItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;
    const load = async () => {
      setIsLoading(true);
      setError("");
      try {
        const { data } = await api.get(INVENTORY);
        if (cancelled) return;
        setRows(
          (data.data || []).map(
            (item: {
              id: number;
              itemName: string;
              category?: { name?: string };
              departmentId?: number;
              unitPerBike?: number;
              stocks?: { qty: number }[];
            }) => ({
              id: item.id,
              itemName: item.itemName,
              categoryName: item.category?.name || "-",
              departmentId: item.departmentId,
              unitPerBike: item.unitPerBike ?? 0,
              stock: Array.isArray(item.stocks)
                ? item.stocks.reduce((sum, row) => sum + (Number(row.qty) || 0), 0)
                : 0,
            })
          )
        );
      } catch (err: unknown) {
        if (cancelled) return;
        const apiError = err as {
          response?: { status?: number; data?: { message?: string } };
          message?: string;
        };
        const message = apiError.response?.data?.message;
        setError(
          message ||
          (apiError.response?.status
            ? `Failed to load inventory items (HTTP ${apiError.response.status})`
            : apiError.message || "Failed to load inventory items")
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
      key={isOpen ? "picker-open" : "picker-closed"}
      isOpen={isOpen}
      title={title}
      rows={rows}
      columns={columns}
      searchKeys={["id", "itemName", "categoryName"]}
      isLoading={isLoading && rows.length === 0}
      error={
        error ||
        (!isLoading && rows.length === 0
          ? "No inventory items found. Add items in Master Entries > Inventory."
          : "")
      }
      onClose={onClose}
      onRowSelect={onSelect}
    />
  );
}
