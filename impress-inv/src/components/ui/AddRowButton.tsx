import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/Button";

interface AddRowButtonProps {
  onClick: () => void;
  disabled?: boolean;
  label?: string;
}

// The "add a row" button under the item tables. It is the normal Button component (secondary variant) with the
// same look as the other form buttons (New, View All, Edit, Save).
export function AddRowButton({ onClick, disabled, label = "Add Row" }: AddRowButtonProps) {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      shape="rounded"
      onClick={onClick}
      disabled={disabled}
      leftIcon={<Icon icon="mdi:plus" aria-hidden />}
      className="border border-zinc-400 bg-white hover:bg-zinc-50"
    >
      {label}
    </Button>
  );
}
