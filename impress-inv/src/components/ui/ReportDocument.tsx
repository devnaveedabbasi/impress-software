import { cn } from "@/lib/utils";

export type ReportDocumentEntry = [label: string, value: string | number | null | undefined];

// The header of a one-document report (an inward or a purchase order): small label / value boxes.
// "print" is the plain black-and-white version used on the print pages.
export function ReportDocument({
    entries,
    variant = "screen",
}: {
    entries: ReportDocumentEntry[];
    variant?: "screen" | "print";
}) {
    const shown = entries.filter(([, value]) => value !== undefined && value !== null && value !== "");
    if (shown.length === 0) return null;

    return (
        <div
            className={cn(
                "mb-4 grid gap-2",
                variant === "print" ? "grid-cols-4 text-[13px] text-black" : "grid-cols-2 sm:grid-cols-4"
            )}
        >
            {shown.map(([label, value]) => (
                <div
                    key={label}
                    className={cn(
                        "px-2 py-1.5",
                        variant === "print" ? "border border-zinc-400" : "rounded-md border border-zinc-200 bg-form-bg",
                        label === "Details" || label === "Instruction" ? "col-span-2" : ""
                    )}
                >
                    <div className={cn("text-xs", variant === "print" ? "font-semibold" : "text-zinc-500")}>{label}</div>
                    <div className={cn("break-words text-sm", variant === "print" ? "" : "font-semibold text-zinc-900")}>
                        {String(value)}
                    </div>
                </div>
            ))}
        </div>
    );
}
