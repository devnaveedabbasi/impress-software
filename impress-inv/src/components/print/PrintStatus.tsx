import type { PrintReportState } from "@/hooks/usePrintReport";

interface PrintStatusProps {
  state: PrintReportState;
  message?: string;
  onRetry: () => void;
}

// What a print page shows until its data is ready: loading, a clear error with Retry, or no permission
export function PrintStatus({ state, message, onRetry }: PrintStatusProps) {
  if (state === "loading") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-white text-black">
        <span className="h-8 w-8 animate-spin rounded-full border-4 border-primary-500 border-t-transparent" />
        <p className="text-sm">Preparing report...</p>
      </div>
    );
  }

  if (state === "forbidden") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-white p-6 text-center text-black">
        <p className="text-sm">You do not have permission to view this report.</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-white p-6 text-center text-black">
      <p className="max-w-sm text-sm">{message || "The report could not be loaded."}</p>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-md bg-primary-500 px-6 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-primary-600"
      >
        Retry
      </button>
    </div>
  );
}
