import React, { ReactNode, useEffect, useId, useRef, useState } from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  label: string;
  value: string;
  group?: string;
}

export interface SelectProps {
  label?: string;
  icon?: ReactNode;
  error?: string;
  options: SelectOption[];
  value?: string | string[];
  onChange?: (value: string | string[]) => void;
  placeholder?: string;
  isSearch?: boolean;
  multiple?: boolean;
  showSelectAll?: boolean;
  disabled?: boolean;
  className?: string;
  wrapperClassName?: string;
  placement?: "top" | "bottom";
  inline?: boolean;
  lockedValues?: string[];
}

export function Select({
  label,
  icon,
  error,
  options,
  value = "",
  onChange,
  placeholder = "Select an option",
  isSearch = false,
  multiple = false,
  showSelectAll = false,
  disabled = false,
  className,
  wrapperClassName,
  placement = "bottom",
  inline = false,
  lockedValues = [],
}: SelectProps) {
  const generatedId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selectedValues = Array.isArray(value) ? value : value ? [value] : [];
  const selectedOptions = options.filter((o) => selectedValues.includes(o.value) || lockedValues.includes(o.value));

  const filteredOptions = options.filter((o) => {
    const searchLower = search.trim().toLowerCase();
    const labelMatch = String(o.label || "").toLowerCase().includes(searchLower);
    const groupMatch = o.group ? String(o.group).toLowerCase().includes(searchLower) : false;
    return labelMatch || groupMatch;
  });

  const allSelected = options.length > 0 && options.every((o) => selectedValues.includes(o.value));

  // Group options for cleaner rendering
  const groupedOptions = filteredOptions.reduce((acc, option) => {
    const group = option.group || "General";
    if (!acc[group]) acc[group] = [];
    acc[group].push(option);
    return acc;
  }, {} as Record<string, SelectOption[]>);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (!containerRef.current?.contains(e.target as Node)) setIsOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  function toggleOption(optionValue: string) {
    if (!multiple) {
      onChange?.(optionValue);
      setSearch("");
      setIsOpen(false);
      return;
    }
    if (lockedValues.includes(optionValue)) return;
    const next = selectedValues.includes(optionValue)
      ? selectedValues.filter((v) => v !== optionValue)
      : [...selectedValues, optionValue];
    onChange?.(next);
  }

  function toggleAll() {
    onChange?.(allSelected ? [] : options.filter(o => !lockedValues.includes(o.value)).map((o) => o.value));
  }

  const displayValue = multiple
    ? selectedValues.length ? `${selectedValues.length} selected` : placeholder
    : selectedOptions[0]?.label ?? placeholder;

  const dropdownContent = (
    <>
      {isSearch && (
        <div className="m-1 flex items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 text-zinc-400 focus-within:border-primary-400">
          <Icon icon="mdi:magnify" className="h-4 w-4 shrink-0" />
          <input
            autoFocus
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => e.stopPropagation()}
            placeholder="Search options..."
            className="min-w-0 flex-1 bg-transparent text-sm text-zinc-700 outline-none placeholder:text-zinc-400"
          />
        </div>
      )}
      {multiple && showSelectAll && (
        <button
          type="button"
          onClick={toggleAll}
          className="flex w-full items-center gap-3 rounded-lg border-b border-zinc-100 px-3 py-2.5 text-left text-sm text-zinc-700 hover:bg-primary-50"
        >
          <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", allSelected ? "border-primary-500 bg-primary-500 text-white" : "border-zinc-300")}>
            {allSelected && <Icon icon="mdi:check" className="h-3 w-3" />}
          </span>
          Select All
        </button>
      )}
      <div
        className={cn("max-h-60 overflow-y-auto", multiple ? "grid grid-cols-1 sm:grid-cols-2 p-1 gap-x-2" : "")}
        role="listbox"
        aria-multiselectable={multiple}
      >
        {filteredOptions.length ? (
          filteredOptions.map((option, index) => {
            const isLocked = lockedValues.includes(option.value);
            const selected = selectedValues.includes(option.value) || isLocked;
            const showGroup = option.group && (index === 0 || filteredOptions[index - 1]?.group !== option.group);

            return (
              <React.Fragment key={option.value}>
                {showGroup && (
                  <p className={cn("px-3 pb-1 pt-3 text-xs font-semibold text-zinc-500", multiple ? "col-span-1 sm:col-span-2" : "")}>
                    {option.group}
                  </p>
                )}
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => toggleOption(option.value)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm transition-colors hover:bg-primary-50 hover:text-primary-700",
                    selected ? "bg-primary-50 text-primary-700" : "text-zinc-700",
                    isLocked ? "opacity-60 cursor-not-allowed bg-primary-50 hover:bg-primary-50" : ""
                  )}
                >
                  {multiple && (
                    <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors", selected ? "border-primary-500 bg-primary-500 text-white" : "border-zinc-300")}>
                      {selected && <Icon icon="mdi:check" className="h-3 w-3" />}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {option.label}
                    {isLocked && <span className="ml-2 text-xs text-primary-600">(Role Inherited)</span>}
                  </span>
                  {!multiple && selected && <Icon icon="mdi:check" className="h-4 w-4 text-primary-600" />}
                </button>
              </React.Fragment>
            );
          })
        ) : (
          <p className={cn("px-3 py-4 text-center text-sm text-zinc-500", multiple ? "col-span-1 sm:col-span-2" : "")}>No options found</p>
        )}
      </div>
    </>
  );

  return (
    <div ref={containerRef} className={cn("relative w-full", wrapperClassName)}>
      {label && (
        <label htmlFor={generatedId} className="mb-1.5 block text-sm font-medium text-zinc-700">
          {label}
        </label>
      )}
      <button
        id={generatedId}
        type="button"
        disabled={disabled}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-invalid={!!error}
        onClick={() => setIsOpen((open) => !open)}
        className={cn(
          "flex min-h-12 w-full items-center gap-3 rounded-xl border bg-white px-4 py-3 text-left text-sm outline-none transition-colors focus:border-primary-400 disabled:cursor-not-allowed disabled:bg-zinc-50",
          error ? "border-red-400" : isOpen ? "border-primary-400" : "border-zinc-300",
          className
        )}
      >
        {icon && <span className="shrink-0 text-zinc-500 [&>svg]:h-5 [&>svg]:w-5">{icon}</span>}
        <span className={cn("min-w-0 flex-1 truncate", selectedOptions.length ? "text-zinc-700" : "text-zinc-400")}>
          {displayValue}
        </span>
        <Icon icon={isOpen ? "mdi:chevron-up" : "mdi:chevron-down"} className="h-5 w-5 shrink-0 text-zinc-500" />
      </button>

      {inline ? (
        <div
          className={cn(
            "grid transition-all duration-300 ease-in-out",
            isOpen ? "grid-rows-[1fr] mt-2 opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
          )}
        >
          <div className="overflow-hidden">
            <div className="overflow-hidden rounded-xl border border-primary-200 bg-white p-1 shadow-xl">
              {dropdownContent}
            </div>
          </div>
        </div>
      ) : (
        isOpen && (
          <div className={cn("absolute left-0 right-0 z-50 overflow-hidden rounded-xl border border-primary-200 bg-white p-1 shadow-xl", placement === "top" ? "bottom-[calc(100%+0.35rem)]" : "top-[calc(100%+0.35rem)]")}>
            {dropdownContent}
          </div>
        )
      )}
      {error && <p className="mt-1.5 text-xs text-red-500">{error}</p>}
    </div>
  );
}
