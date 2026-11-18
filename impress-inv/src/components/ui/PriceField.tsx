"use client";

import { forwardRef } from "react";
import { LabeledField, type LabeledFieldProps } from "@/components/ui/LabeledField";
import { formatPrice, parsePrice } from "@/lib/price";

interface PriceFieldProps extends Omit<LabeledFieldProps, "value" | "onChange" | "type"> {
  // the amount as plain digits ("500000"); the field shows it as 5,00,000
  value: string;
  onValueChange: (digits: string) => void;
  // an amount that may be below zero (for example an opening balance that is owed)
  allowNegative?: boolean;
}

// An amount field: the commas are put in while the user types, and only digits can be typed.
// The form keeps the plain number, so nothing else (validation, save) has to know about the commas.
export const PriceField = forwardRef<HTMLInputElement, PriceFieldProps>(function PriceField(
  { value, onValueChange, allowNegative = false, ...props },
  ref
) {
  return (
    <LabeledField
      ref={ref}
      type="text"
      inputMode={allowNegative ? "text" : "numeric"}
      autoComplete="off"
      value={formatPrice(value)}
      onChange={(event) => onValueChange(parsePrice(event.target.value, allowNegative))}
      {...props}
    />
  );
});
