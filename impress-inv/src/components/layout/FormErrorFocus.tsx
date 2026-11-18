"use client";

import { useEffect } from "react";

const INVALID_FIELD = '[aria-invalid="true"]';
// an error message under a field or a table (red text): used when the error does not belong to one single input
const ERROR_TEXT = "p.text-red-500, span.text-red-500, div.text-red-500, p.text-red-600, p.text-red-400";

// When a form is saved and something required is missing or wrong, the page goes to the FIRST wrong field and puts
// the cursor in it, so the user does not have to look for it (the Save button is often far below the field).
// It works for every form of the system at once: it listens to every form that is submitted, and looks for the
// first field marked invalid (aria-invalid, which the field components set when they show an error) in page order.
// An error that comes a little later (for example after the server answered) is found as well: for a few seconds
// after a Save the form is watched for a new error.
export function FormErrorFocus() {
  useEffect(() => {
    let stopWatching: (() => void) | null = null;

    const firstError = (form: HTMLFormElement): HTMLElement | null => {
      const invalid = form.querySelector<HTMLElement>(INVALID_FIELD);
      if (invalid) return invalid;
      for (const node of form.querySelectorAll<HTMLElement>(ERROR_TEXT)) {
        if (node.textContent?.trim()) return node;
      }
      return null;
    };

    const goTo = (target: HTMLElement) => {
      // an error text belongs to a field next to it: that field gets the cursor
      const field = target.matches("input, select, textarea, button")
        ? target
        : target.parentElement?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled]), button:not([disabled])");
      (field ?? target).scrollIntoView({ block: "center", behavior: "smooth" });
      field?.focus({ preventScroll: true });
    };

    const onSubmit = (event: Event) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      stopWatching?.();

      let done = false;
      const check = () => {
        if (done) return;
        const target = firstError(form);
        if (!target) return;
        done = true;
        stopWatching?.();
        goTo(target);
      };

      // the errors appear after the page has drawn them (a moment after the click)
      const timers = [setTimeout(check, 120), setTimeout(check, 400)];
      // and an error that comes later (after the server answers) is found by watching the form for a short time
      const observer = new MutationObserver(() => {
        if (!done) setTimeout(check, 60);
      });
      observer.observe(form, { childList: true, subtree: true, attributes: true, attributeFilter: ["aria-invalid"] });
      const stopAfter = setTimeout(() => stopWatching?.(), 4000);

      stopWatching = () => {
        timers.forEach(clearTimeout);
        clearTimeout(stopAfter);
        observer.disconnect();
        stopWatching = null;
      };
    };

    // capture: the form's own handler runs as usual, this only looks at the result afterwards
    document.addEventListener("submit", onSubmit, true);
    return () => {
      document.removeEventListener("submit", onSubmit, true);
      stopWatching?.();
    };
  }, []);

  return null;
}
