import { InputHTMLAttributes, forwardRef, useId, useState } from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

export interface LabeledFieldProps extends InputHTMLAttributes<HTMLInputElement> {
  label: string;
  error?: string;
  wrapperClassName?: string;
}

export const LabeledField = forwardRef<HTMLInputElement, LabeledFieldProps>(function LabeledField(
  { label, error, className, wrapperClassName, id, disabled, type = "text", ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";

  return (
    <div className={cn("w-full", wrapperClassName)}>
      <label htmlFor={inputId} className="mb-1 block text-sm text-zinc-600">
        {label}
      </label>
      <div className="relative">
        <input
          ref={ref}
          id={inputId}
          type={isPassword && showPassword ? "text" : type}
          disabled={disabled}
          aria-invalid={!!error}
          className={cn(
            "w-full rounded-md border bg-white px-3 py-2 text-sm text-zinc-900 outline-none transition-colors focus:border-primary-400 disabled:bg-zinc-50 disabled:text-zinc-400",
            isPassword && "pr-10",
            error ? "border-red-400" : "border-zinc-300",
            className
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((visible) => !visible)}
            disabled={disabled}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-zinc-500 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Icon
              icon={showPassword ? "mdi:eye-off-outline" : "mdi:eye-outline"}
              className="h-5 w-5"
            />
          </button>
        )}
      </div>
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});
