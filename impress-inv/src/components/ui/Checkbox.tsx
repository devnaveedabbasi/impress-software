import { InputHTMLAttributes, forwardRef, useId } from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

export interface CheckboxProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  wrapperClassName?: string;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, className, wrapperClassName, id, disabled, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <label
      htmlFor={inputId}
      className={cn(
        "group relative flex cursor-pointer select-none items-center gap-3 text-sm font-medium text-zinc-700 transition-colors hover:text-zinc-900",
        disabled && "cursor-not-allowed opacity-50 hover:text-zinc-700",
        wrapperClassName
      )}
    >
      <div className="relative flex items-center justify-center">
        <input
          ref={ref}
          id={inputId}
          type="checkbox"
          disabled={disabled}
          className={cn(
            "peer h-5 w-5 appearance-none rounded-[6px] border-2 border-zinc-300 bg-white transition-all duration-200",
            "hover:border-primary-400 hover:shadow-sm",
            "focus:outline-none focus-visible:ring-4 focus-visible:ring-primary-500/20",
            "checked:border-primary-500 checked:bg-primary-500",
            "disabled:border-zinc-200 disabled:bg-zinc-50 disabled:shadow-none",
            className
          )}
          {...props}
        />
        <Icon 
          icon="mdi:check" 
          className="pointer-events-none absolute h-3.5 w-3.5 scale-0 text-white transition-transform duration-200 peer-checked:scale-100" 
        />
      </div>
      {label && <span>{label}</span>}
    </label>
  );
});
