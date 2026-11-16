import { cn } from "@/lib/utils";
import { ReportDocument, type ReportDocumentEntry } from "@/components/ui/ReportDocument";

export type DocumentColumn<Row> = {
    header: string;
    align?: "left" | "center" | "right";
    render: (row: Row) => string;
};

// A one-document report (an inward, a purchase order) laid out like the printed paper:
// title, the document's details, its item table with a total row, and a summary block.
export function DocumentSheet<Row>({
    title,
    entries,
    columns,
    rows,
    totalRow,
    summary,
    isLoading = false,
    error = "",
    onRetry,
    variant = "screen",
}: {
    title: string;
    entries: ReportDocumentEntry[];
    columns: DocumentColumn<Row>[];
    rows: Row[];
    /** Last row of the table: a label over the first columns, then one value per remaining column */
    totalRow?: { label: string; values: string[] };
    /** Small block under the table (label / value), e.g. tax and grand total */
    summary?: [label: string, value: string][];
    isLoading?: boolean;
    error?: string;
    onRetry?: () => void;
    variant?: "screen" | "print";
}) {
    const alignClass = (align?: "left" | "center" | "right") =>
        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";
    const colSpanLabel = totalRow ? columns.length + 1 - totalRow.values.length : 1;

    return (
        <div className={cn("text-black", variant === "print" ? "" : "border border-zinc-300 bg-white p-4 sm:p-6")}>
            <h2 className="mb-5 text-center text-xl font-bold uppercase tracking-wider sm:text-2xl">{title}</h2>

            {error ? (
                <p className="py-10 text-center text-sm text-red-500">
                    {error}
                    {onRetry && (
                        <>
                            {" "}
                            <button type="button" onClick={onRetry} className="font-medium underline">
                                Retry
                            </button>
                        </>
                    )}
                </p>
            ) : isLoading ? (
                <p className="py-10 text-center text-sm text-zinc-500">Loading...</p>
            ) : (
                <>
                    <ReportDocument variant="print" entries={entries} />

                    <div className="overflow-x-auto">
                        <table className="w-full border-collapse border border-zinc-400 bg-white text-[13px]">
                            <thead>
                                <tr className="bg-[#e4e4e4]">
                                    <th className="w-12 border border-zinc-400 p-2 text-center">S.No</th>
                                    {columns.map((column) => (
                                        <th key={column.header} className={cn("border border-zinc-400 p-2", alignClass(column.align))}>
                                            {column.header}
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {rows.length === 0 ? (
                                    <tr>
                                        <td colSpan={columns.length + 1} className="py-4 text-center">
                                            No items found
                                        </td>
                                    </tr>
                                ) : (
                                    rows.map((row, index) => (
                                        <tr key={index}>
                                            <td className="border border-zinc-400 p-1 text-center">{index + 1}</td>
                                            {columns.map((column) => (
                                                <td
                                                    key={column.header}
                                                    className={cn("border border-zinc-400 p-1 px-2", alignClass(column.align))}
                                                >
                                                    {column.render(row)}
                                                </td>
                                            ))}
                                        </tr>
                                    ))
                                )}
                            </tbody>
                            {totalRow && rows.length > 0 && (
                                <tfoot>
                                    <tr className="bg-[#e4e4e4] font-bold">
                                        <td colSpan={colSpanLabel} className="border border-zinc-400 p-1 px-2 text-right">
                                            {totalRow.label}
                                        </td>
                                        {totalRow.values.map((value, index) => (
                                            <td key={index} className="border border-zinc-400 p-1 px-2 text-center">
                                                {value}
                                            </td>
                                        ))}
                                    </tr>
                                </tfoot>
                            )}
                        </table>
                    </div>

                    {summary && summary.length > 0 && (
                        <table className="mt-4 ml-auto w-full max-w-xs border-collapse border border-zinc-400 text-[13px]">
                            <tbody>
                                {summary.map(([label, value], index) => (
                                    <tr key={label} className={index === summary.length - 1 ? "bg-[#e4e4e4] font-bold" : ""}>
                                        <td className="border border-zinc-400 p-1 px-2">{label}</td>
                                        <td className="border border-zinc-400 p-1 px-2 text-right">{value}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </>
            )}
        </div>
    );
}
