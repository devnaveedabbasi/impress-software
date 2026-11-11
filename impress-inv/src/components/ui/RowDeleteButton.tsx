import { Icon } from "@iconify/react";

// Table row with the "hover to delete" behaviour: the row highlights on hover, and turns light red while the
// mouse is over its trash icon so the user can see exactly which row will be removed.
export const deletableRowClassName =
  "group border-b border-zinc-300 last:border-b-0 hover:bg-zinc-50 has-[.row-delete:hover]:bg-red-50 has-[.row-delete:focus-visible]:bg-red-50";

interface RowDeleteButtonProps {
  rowNumber: number;
  onClick: () => void;
}

// Place inside the LAST cell of the row (the cell must be `relative`). Hidden until the row is hovered.
export function RowDeleteButton({ rowNumber, onClick }: RowDeleteButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Remove this row"
      aria-label={`Remove row ${rowNumber}`}
      className="row-delete absolute right-1 top-1/2 -translate-y-1/2 rounded p-0.5 text-red-500 opacity-0 transition-opacity hover:bg-red-100 hover:text-red-700 focus-visible:opacity-100 group-hover:opacity-100"
    >
      <Icon icon="mdi:trash-can-outline" className="h-4 w-4" />
    </button>
  );
}
