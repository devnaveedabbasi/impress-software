"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";

interface TextDetailModalProps {
  isOpen: boolean;
  title: string;
  subtitle?: string;
  value: string;
  readOnly?: boolean;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  placeholder?: string;
  onSave: (value: string) => void;
  onClose: () => void;
}

// Validation for the text: returns an error message or an empty string
export function validateDetailText(
  text: string,
  { label, required, minLength, maxLength }: { label: string; required?: boolean; minLength?: number; maxLength?: number }
) {
  const trimmed = text.trim();
  if (required && trimmed.length === 0) return `${label} is required`;
  if (trimmed.length > 0 && minLength && trimmed.length < minLength) {
    return `${label} must be at least ${minLength} characters`;
  }
  if (maxLength && trimmed.length > maxLength) return `${label} must be at most ${maxLength} characters`;
  return "";
}

function ModalBody({
  title,
  subtitle,
  value,
  readOnly,
  required,
  minLength = 0,
  maxLength = 255,
  placeholder,
  onSave,
  onClose,
}: Omit<TextDetailModalProps, "isOpen">) {
  const [draft, setDraft] = useState(value);
  const [touched, setTouched] = useState(false);

  const error = validateDetailText(draft, { label: title, required, minLength, maxLength });
  const showError = Boolean(error) && (touched || draft.length > 0);

  const save = () => {
    setTouched(true);
    if (error) return;
    onSave(draft.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="text-detail-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") onClose();
        if (event.key === "Enter" && (event.ctrlKey || event.metaKey) && !readOnly) save();
      }}
    >
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-zinc-200 px-5 py-4">
          <div>
            <h2 id="text-detail-modal-title" className="text-lg font-semibold text-zinc-900">
              {title}
            </h2>
            {subtitle && <p className="text-xs text-zinc-500">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-zinc-500 hover:text-zinc-900"
          >
            ×
          </button>
        </div>

        <div className="p-4">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value.slice(0, maxLength + 50))}
            onBlur={() => setTouched(true)}
            readOnly={readOnly}
            autoFocus
            rows={7}
            placeholder={placeholder}
            aria-invalid={showError}
            className={`w-full resize-y rounded-md border px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary-400 read-only:bg-zinc-50 ${
              showError ? "border-red-400" : "border-zinc-300"
            }`}
          />
          <div className="mt-1 flex items-start justify-between gap-3 text-xs">
            <span className="text-red-500">{showError ? error : ""}</span>
            <span className={draft.trim().length > maxLength ? "text-red-500" : "text-zinc-500"}>
              {draft.trim().length}/{maxLength}
            </span>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-zinc-200 px-4 py-3">
          <Button type="button" size="sm" variant="outline" shape="rounded" onClick={onClose}>
            {readOnly ? "Close" : "Cancel"}
          </Button>
          {!readOnly && (
            <Button type="button" size="sm" shape="rounded" onClick={save} disabled={Boolean(error)}>
              Done
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

// Opens a modal to read and write a longer text. Mounting the body only while open resets the draft each time.
export function TextDetailModal({ isOpen, ...props }: TextDetailModalProps) {
  if (!isOpen) return null;
  return <ModalBody {...props} />;
}
