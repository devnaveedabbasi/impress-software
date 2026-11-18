"use client";

// A Print button for a print page. It is only on the screen, it does not appear on the paper.
export function PrintButton() {
  return (
    <div className="mx-auto mb-4 flex max-w-4xl justify-end print:hidden">
      <button
        type="button"
        onClick={() => window.print()}
        className="rounded-md bg-primary-500 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
      >
        Print
      </button>
    </div>
  );
}
