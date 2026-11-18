"use client";

import { forwardRef, useEffect, useId, useMemo, useRef, useState, type ButtonHTMLAttributes } from "react";
import { Icon } from "@iconify/react";
import { cn } from "@/lib/utils";

export interface LabeledSelectOption {
  label: string;
  value: string;
}

export interface LabeledSelectProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "value" | "onChange"> {
  label: string;
  options: LabeledSelectOption[];
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  error?: string;
  wrapperClassName?: string;
  /** Show the search box when there are more options than this (default 6) */
  searchThreshold?: number;
  /** "cell": for a table cell - no visible label, no box of its own, and the list floats over the table */
  variant?: "field" | "cell";
}

const MENU_HEIGHT = 300;

// A dropdown with a search box. Same props as before (label, options, value, onChange), so every page that
// used the plain select gets the search, keyboard support and a scrollable list without any change.
export const LabeledSelect = forwardRef<HTMLButtonElement, LabeledSelectProps>(function LabeledSelect(
  {
    label,
    options,
    value,
    onChange,
    placeholder = "Select",
    error,
    className,
    wrapperClassName,
    id,
    disabled,
    searchThreshold = 6,
    variant = "field",
    ...props
  },
  ref
) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const containerRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const [isOpen, setIsOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const isCell = variant === "cell";
  // a cell sits inside a scrolling table, so its list is placed on the screen (fixed), not inside the cell
  const [floatPos, setFloatPos] = useState<{ top?: number; bottom?: number; left: number; width: number; maxHeight: number } | null>(null);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const selected = options.find((option) => option.value === (value ?? ""));
  const showSearch = options.length > searchThreshold;

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;
    return options.filter((option) => option.label.toLowerCase().includes(term));
  }, [options, search]);

  const close = () => {
    setIsOpen(false);
    setSearch("");
  };

  const open = () => {
    if (disabled) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      // a normal dropdown opens up when there is no room below; a table cell opens down (the list gets shorter and
      // scrolls) unless there is hardly any room below and clearly more above
      const up = isCell
        ? below < 160 && rect.top > below
        : below < MENU_HEIGHT && rect.top > below;
      setOpenUp(up);
      setFloatPos({
        left: rect.left,
        width: Math.max(rect.width, 200),
        maxHeight: Math.max((up ? rect.top : below) - 16, 120),
        ...(up ? { bottom: window.innerHeight - rect.top + 4 } : { top: rect.bottom + 4 }),
      });
    }
    const selectedIndex = options.findIndex((option) => option.value === (value ?? ""));
    setActiveIndex(Math.max(selectedIndex, 0));
    setIsOpen(true);
  };

  const choose = (option: LabeledSelectOption) => {
    onChange?.(option.value);
    close();
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) close();
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // a floating list would be left behind when the page or the table moves: it closes
  useEffect(() => {
    if (!isOpen || !isCell) return;
    // the list scrolling by itself (arrow keys, the mouse over it) must not close it: only the page or the table
    const handle = (event: Event) => {
      if (listRef.current && event.target instanceof Node && listRef.current.contains(event.target)) return;
      if (event.target === listRef.current) return;
      close();
    };
    window.addEventListener("scroll", handle, true);
    window.addEventListener("resize", handle);
    return () => {
      window.removeEventListener("scroll", handle, true);
      window.removeEventListener("resize", handle);
    };
  }, [isOpen, isCell]);

  useEffect(() => {
    if (isOpen && showSearch) searchRef.current?.focus();
  }, [isOpen, showSearch]);

  // The first match is highlighted while typing
  useEffect(() => {
    setActiveIndex(0);
  }, [search]);

  // Keep the highlighted option in view while moving with the arrow keys
  useEffect(() => {
    if (!isOpen) return;
    // only the list is moved (not the page or the table around it, which scrollIntoView would also move)
    const list = listRef.current;
    const item = list?.querySelector<HTMLElement>(`[data-index="${activeIndex}"]`);
    if (!list || !item) return;
    if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
    else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight)
      list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
  }, [activeIndex, isOpen]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (disabled) return;
    if (!isOpen) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(event.key)) {
        event.preventDefault();
        open();
      }
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      close();
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => Math.min(index + 1, filtered.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => Math.max(index - 1, 0));
    } else if (event.key === "Enter") {
      // Enter inside a form must not submit it while the list is open
      event.preventDefault();
      if (filtered[activeIndex]) choose(filtered[activeIndex]);
    } else if (event.key === "Tab") {
      close();
    }
  };

  return (
    <div ref={containerRef} className={cn("relative w-full", wrapperClassName)} onKeyDown={handleKeyDown}>
      <label htmlFor={selectId} className={isCell ? "sr-only" : "mb-1 block text-sm text-zinc-600"}>
        {label}
      </label>
      <button
        ref={ref}
        id={selectId}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-invalid={!!error}
        onClick={() => (isOpen ? close() : open())}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left outline-none transition-colors disabled:text-zinc-400",
          isCell
            ? "rounded-none border-0 bg-transparent px-2 py-1.5 text-[13px] font-medium focus:bg-primary-50 disabled:bg-[#f3f4f6]"
            : "rounded-md border bg-white px-3 py-2 text-sm focus:border-primary-400 disabled:bg-zinc-50",
          !isCell && isOpen && "border-primary-400",
          !isCell && (error ? "border-red-400" : "border-zinc-300"),
          className
        )}
        {...props}
      >
        <span className={cn("truncate", selected ? "text-zinc-900" : "text-zinc-400")}>
          {selected ? selected.label : placeholder}
        </span>
        <Icon
          icon="mdi:chevron-down"
          className={cn("h-4 w-4 shrink-0 text-zinc-500 transition-transform", isOpen && "rotate-180")}
        />
      </button>

      {isOpen && (
        <div
          className={cn(
            "z-50 overflow-hidden rounded-md border border-zinc-300 bg-white shadow-lg",
            isCell ? "fixed flex flex-col" : "absolute left-0 right-0",
            !isCell && (openUp ? "bottom-full mb-1" : "top-full mt-1")
          )}
          style={isCell && floatPos ? floatPos : undefined}
        >
          {showSearch && (
            <div className="border-b border-zinc-200 p-2">
              <div className="relative">
                <Icon icon="mdi:magnify" className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
                <input
                  ref={searchRef}
                  type="text"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search..."
                  aria-label={`Search ${label}`}
                  className="w-full rounded-md border border-zinc-300 bg-white py-1.5 pl-8 pr-2 text-sm text-zinc-900 outline-none focus:border-primary-400"
                />
              </div>
            </div>
          )}
          <ul ref={listRef} role="listbox" className={cn("relative overflow-y-auto py-1", isCell ? "min-h-0 flex-1" : "max-h-60")}>
            {filtered.length === 0 ? (
              <li className="px-3 py-3 text-center text-sm text-zinc-500">No results found</li>
            ) : (
              filtered.map((option, index) => {
                const isSelected = option.value === (value ?? "");
                return (
                  <li
                    key={option.value}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(index)}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => choose(option)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-sm text-zinc-900",
                      index === activeIndex && "bg-primary-50",
                      isSelected && "font-medium text-primary-700"
                    )}
                  >
                    <span className="truncate">{option.label}</span>
                    {isSelected && <Icon icon="mdi:check" className="h-4 w-4 shrink-0 text-primary-600" />}
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  );
});
