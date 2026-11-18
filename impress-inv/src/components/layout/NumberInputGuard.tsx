"use client";

import { useEffect } from "react";

// Every number box of the system (<input type="number">) takes only 0 or more:
//   - the keys  -  +  e  E  are not accepted (the minus sign, a plus sign and the exponent of a number like 1e5)
//   - the arrow keys / the little arrows stop at 0 (the box gets min="0" unless the page set its own minimum)
//   - a pasted text with a minus sign is refused
// A box that really may go below zero marks itself with data-allow-negative (for example an opening balance).
// This works for every page at once, so a new page needs nothing extra.
export function NumberInputGuard() {
  useEffect(() => {
    const isGuarded = (target: EventTarget | null): target is HTMLInputElement =>
      target instanceof HTMLInputElement && target.type === "number" && !target.hasAttribute("data-allow-negative");

    const onFocus = (event: FocusEvent) => {
      const target = event.target;
      if (isGuarded(target) && !target.hasAttribute("min")) target.min = "0";
    };

    const onKeyDown = (event: KeyboardEvent) => {
      if (!isGuarded(event.target) || event.ctrlKey || event.metaKey) return;
      if (["-", "+", "e", "E"].includes(event.key)) event.preventDefault();
    };

    const onPaste = (event: ClipboardEvent) => {
      if (!isGuarded(event.target)) return;
      const text = event.clipboardData?.getData("text") ?? "";
      if (/[-+eE]/.test(text)) event.preventDefault();
    };

    document.addEventListener("focusin", onFocus);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("paste", onPaste);
    return () => {
      document.removeEventListener("focusin", onFocus);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("paste", onPaste);
    };
  }, []);

  return null;
}
