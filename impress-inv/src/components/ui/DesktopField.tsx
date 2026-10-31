import { InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

export interface DesktopFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  wrapperClassName?: string;
  theme?: "default" | "primary";
}

export const DesktopField = forwardRef<HTMLInputElement, DesktopFieldProps>(function DesktopField(
  { label, error, className, wrapperClassName, id, disabled, theme = "default", ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={cn("flex items-stretch mb-[6px]", wrapperClassName)}>
      <label
        htmlFor={inputId}
        className="w-[130px] bg-[#f9fafb] border border-zinc-300 px-2 text-[13px] text-black flex items-center justify-end shrink-0 h-[28px]"
      >
        {label}
      </label>
      <div className="flex-1 ml-1 relative">
        <input
          ref={ref}
          id={inputId}
          disabled={disabled}
          aria-invalid={!!error}
          className={cn(
            "w-full h-[28px] border px-2 text-[13px] outline-none transition-colors focus:border-blue-500 disabled:bg-[#f3f4f6] disabled:text-zinc-600",
            error ? "border-red-400" : "border-zinc-300",
            theme === "primary" ? "bg-[#0b64d0] text-white border-[#0b64d0] disabled:opacity-90 disabled:bg-[#0b64d0] disabled:text-white" : "bg-white text-black",
            className
          )}
          {...props}
        />
        {error && <p className="absolute -bottom-4 left-0 text-[10px] text-red-500 truncate w-full">{error}</p>}
      </div>
    </div>
  );
});
