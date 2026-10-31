import { SelectHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface DesktopSelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label: string;
  error?: string;
  wrapperClassName?: string;
  options: { label: string; value: string | number }[];
  placeholder?: string;
}

export const DesktopSelect = forwardRef<HTMLSelectElement, DesktopSelectProps>(function DesktopSelect(
  { label, error, className, wrapperClassName, id, disabled, options, placeholder, ...props },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;

  return (
    <div className={cn("flex items-stretch mb-[6px]", wrapperClassName)}>
      <label
        htmlFor={selectId}
        className="w-[130px] bg-[#f9fafb] border border-zinc-300 px-2 text-[13px] text-black flex items-center justify-end shrink-0 h-[28px]"
      >
        {label}
      </label>
      <div className="flex-1 ml-1 relative">
        <select
          ref={ref}
          id={selectId}
          disabled={disabled}
          aria-invalid={!!error}
          className={cn(
            "w-full h-[28px] border px-1.5 py-0 text-[13px] outline-none transition-colors focus:border-blue-500 disabled:bg-[#f3f4f6] disabled:text-zinc-600 bg-white text-black",
            error ? "border-red-400" : "border-zinc-300",
            className
          )}
          {...props}
        >
          {placeholder && (
            <option value="" disabled hidden>
              {placeholder}
            </option>
          )}
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {error && <p className="absolute -bottom-4 left-0 text-[10px] text-red-500 truncate w-full">{error}</p>}
      </div>
    </div>
  );
});
