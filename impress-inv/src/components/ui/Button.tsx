import { ButtonHTMLAttributes, forwardRef, ReactNode } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "outline" | "ghost" | "danger" | "secondary";
type ButtonSize = "sm" | "md" | "lg" | "icon";
type ButtonShape = "default" | "rounded" | "pill" | "square" | "circle";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  shape?: ButtonShape;
  isLoading?: boolean;
  icon?: ReactNode; // Deprecated, use leftIcon
  leftIcon?: ReactNode;
  rightIcon?: ReactNode;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-500 text-white hover:bg-primary-600 border border-transparent shadow-sm disabled:bg-primary-300 disabled:shadow-none",
  secondary:
    "bg-zinc-100 text-zinc-900 hover:bg-zinc-200 border border-transparent disabled:bg-zinc-50 disabled:text-zinc-400",
  outline:
    "border border-primary-500 text-primary-600 hover:bg-primary-50 disabled:border-primary-200 disabled:text-primary-300 disabled:bg-transparent",
  ghost:
    "text-primary-600 hover:bg-primary-50 disabled:text-primary-300 disabled:bg-transparent",
  danger:
    "bg-red-500 text-white hover:bg-red-600 border border-transparent shadow-sm disabled:bg-red-300 disabled:shadow-none",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "px-3 py-1.5 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-6 py-3 text-base",
  icon: "p-2", // For icon-only buttons
};

const shapeClasses: Record<ButtonShape, string> = {
  default: "rounded-xl",
  rounded: "rounded-md",
  pill: "rounded-full",
  square: "rounded-none",
  circle: "rounded-full aspect-square p-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    className,
    variant = "primary",
    size = "md",
    shape = "default",
    isLoading,
    disabled,
    icon,
    leftIcon,
    rightIcon,
    children,
    ...props
  },
  ref
) {
  const actualLeftIcon = leftIcon || icon;

  return (
    <button
      ref={ref}
      disabled={disabled || isLoading}
      className={cn(
        "inline-flex items-center justify-center gap-2 font-medium transition-all focus:outline-none focus:ring-2 focus:ring-primary-500/30 disabled:cursor-not-allowed",
        variantClasses[variant],
        sizeClasses[size],
        shapeClasses[shape],
        className
      )}
      {...props}
    >
      {isLoading && (
        <span
          aria-hidden
          className={cn(
            "h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent",
            children ? "mr-1" : ""
          )}
        />
      )}

      {!isLoading && actualLeftIcon && (
        <span className="shrink-0 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
          {actualLeftIcon}
        </span>
      )}

      {children && <span>{children}</span>}

      {!isLoading && rightIcon && (
        <span className="shrink-0 flex items-center justify-center [&>svg]:h-4 [&>svg]:w-4">
          {rightIcon}
        </span>
      )}
    </button>
  );
});
