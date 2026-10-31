import { InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface LabeledFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  wrapperClassName?: string;
}

export const LabeledField = forwardRef<HTMLInputElement, LabeledFieldProps>(function LabeledField(
  { label, error, className, wrapperClassName, id, disabled, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn("w-full", wrapperClassName)}>
      <label htmlFor={inputId} className="mb-1 block text-sm text-zinc-600">
        {label}
      </label>
      <input
        ref={ref}
        id={inputId}
        disabled={disabled}
        aria-invalid={!!error}
        className={cn(
          "w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary-400 disabled:bg-zinc-50 disabled:text-zinc-400",
          error ? "border-red-400" : "border-zinc-300",
          className
        )}
        {...props}
      />
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});
