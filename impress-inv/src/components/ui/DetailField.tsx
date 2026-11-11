"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils";
import { previewText } from "@/lib/text";
import { TextDetailModal } from "@/components/ui/TextDetailModal";

interface DetailFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  wrapperClassName?: string;
}

// A form field for longer text: the field shows only the first few words, a click opens the full text in a
// modal where it can be read and edited (with validation). Same look as LabeledField.
export function DetailField({
  label,
  value,
  onChange,
  disabled,
  error,
  required,
  minLength,
  maxLength = 255,
  placeholder,
  wrapperClassName,
}: DetailFieldProps) {
  const id = useId();
  const [isOpen, setIsOpen] = useState(false);
  const preview = previewText(value, 5, 40);
  // In view mode (not editing) the text can still be opened and read
  const canOpen = !disabled || Boolean(value);

  return (
    <div className={cn("w-full", wrapperClassName)}>
      <label htmlFor={id} className="mb-1 block text-sm text-zinc-600">
        {label}
      </label>
      <button
        id={id}
        type="button"
        onClick={() => canOpen && setIsOpen(true)}
        title={value || (disabled ? undefined : `Click to add ${label.toLowerCase()}`)}
        aria-invalid={!!error}
        className={cn(
          "block w-full truncate rounded-md border bg-white px-3 py-2 text-left text-sm outline-none transition-colors focus:border-primary-400",
          disabled ? "cursor-default bg-zinc-50" : "cursor-pointer hover:bg-primary-50",
          value ? (disabled ? "text-zinc-500" : "text-zinc-900") : "text-zinc-400",
          error ? "border-red-400" : "border-zinc-300"
        )}
      >
        {preview || (disabled ? " " : placeholder || "Click to add")}
      </button>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}

      <TextDetailModal
        isOpen={isOpen}
        title={label}
        value={value}
        readOnly={disabled}
        required={required}
        minLength={minLength}
        maxLength={maxLength}
        placeholder={placeholder}
        onSave={(text) => {
          onChange(text);
          setIsOpen(false);
        }}
        onClose={() => setIsOpen(false)}
      />
    </div>
  );
}
