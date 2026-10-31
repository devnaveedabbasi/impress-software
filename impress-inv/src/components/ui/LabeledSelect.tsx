import { SelectHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface LabeledSelectOption {
  label: string;
  value: string;
}

export interface LabeledSelectProps
  extends Omit<SelectHTMLAttributes<HTMLSelectElement>, "value" | "onChange"> {
  label: string;
  options: LabeledSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  wrapperClassName?: string;
}

export const LabeledSelect = forwardRef<HTMLSelectElement, LabeledSelectProps>(function LabeledSelect(
  { label, options, value, onChange, placeholder = "Select", error, className, wrapperClassName, id, disabled, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn("w-full", wrapperClassName)}>
      <label htmlFor={selectId} className="mb-1 block text-sm text-zinc-600">
        {label}
      </label>
      <select
        ref={ref}
        id={selectId}
        disabled={disabled}
        aria-invalid={!!error}
        value={value ?? ""}
        onChange={(event) => onChange?.(event.target.value)}
        className={cn(
          "w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary-400 disabled:bg-zinc-50 disabled:text-zinc-400",
          error ? "border-red-400" : "border-zinc-300",
          className
        )}
        {...props}
      >
        <option value="" disabled hidden>
          {placeholder}
        </option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});
