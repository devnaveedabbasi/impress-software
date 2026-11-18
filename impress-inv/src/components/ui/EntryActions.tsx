"use client";

import { Button } from "@/components/ui/Button";
import { ExitButton } from "@/components/ui/ExitButton";

interface EntryActionsProps {
  onNew: () => void;
  newDisabled?: boolean;
  onViewAll: () => void;
  viewAllDisabled?: boolean;
  onEdit: () => void;
  editDisabled?: boolean;
  // Save submits the form it is in
  saveLoading?: boolean;
  saveDisabled?: boolean;
  // only the entry screens that have a printout
  onPrint?: () => void;
}

const buttonClass = "border border-zinc-400 bg-white px-6 hover:bg-zinc-50";

// The row of buttons under a master entry form: New, View All, Edit, Save, (Print), Exit.
export function EntryActions({
  onNew,
  newDisabled,
  onViewAll,
  viewAllDisabled,
  onEdit,
  editDisabled,
  saveLoading,
  saveDisabled,
  onPrint,
}: EntryActionsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 pt-6 sm:flex sm:flex-wrap sm:items-center sm:justify-center">
      <Button type="button" variant="secondary" shape="rounded" onClick={onNew} disabled={newDisabled} className={buttonClass}>
        New
      </Button>
      <Button type="button" variant="secondary" shape="rounded" onClick={onViewAll} disabled={viewAllDisabled} className={buttonClass}>
        View All
      </Button>
      <Button type="button" variant="secondary" shape="rounded" onClick={onEdit} disabled={editDisabled} className={buttonClass}>
        Edit
      </Button>
      <Button
        type="submit"
        variant="secondary"
        shape="rounded"
        isLoading={saveLoading}
        disabled={saveDisabled}
        className="border border-zinc-400 bg-white px-8 hover:bg-zinc-50"
      >
        Save
      </Button>
      {onPrint && (
        <Button type="button" variant="secondary" shape="rounded" onClick={onPrint} className={buttonClass}>
          Print
        </Button>
      )}
      <ExitButton className={buttonClass} />
    </div>
  );
}
