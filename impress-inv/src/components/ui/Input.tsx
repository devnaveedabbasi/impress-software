import { InputHTMLAttributes, ReactNode, forwardRef, useId, useState } from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  icon?: ReactNode;
  error?: string;
  wrapperClassName?: string;
  theme?: "default" | "primary";
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, icon, error, theme = "default", type = "text", className, wrapperClassName, id, ...props },
  ref
) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === "password";
  const inputType = isPassword && showPassword ? "text" : type;

  return (
    <div className={cn("w-full", wrapperClassName)}>
      {label && (
        <label htmlFor={inputId} className="mb-1.5 block text-sm font-medium text-zinc-700">
          {label}
        </label>
      )}
      <div
        className={cn(
          "flex items-center gap-3 rounded-xl border px-4 py-3 focus-within:border-primary-400",
          error ? "border-red-400" : "border-zinc-200",
          theme === "primary" ? "bg-primary-600 border-primary-600 text-white" : "bg-white",
          className
        )}
      >
        {icon && (
          <span className={cn("shrink-0 [&>svg]:h-5 [&>svg]:w-5", theme === "primary" ? "text-primary-100" : "text-zinc-400")}>{icon}</span>
        )}
        <input
          ref={ref}
          id={inputId}
          type={inputType}
          aria-invalid={!!error}
          className={cn(
            "w-full bg-transparent text-sm outline-none",
            theme === "primary" ? "text-white placeholder:text-primary-200" : "text-zinc-900 placeholder:text-zinc-400"
          )}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="shrink-0 text-zinc-400 hover:text-zinc-600"
            aria-label={showPassword ? "Hide password" : "Show password"}
          >
            {showPassword ? (
              <Icon icon="mdi:eye-off-outline" className="h-5 w-5" />
            ) : (
              <Icon icon="mdi:eye-outline" className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
});
