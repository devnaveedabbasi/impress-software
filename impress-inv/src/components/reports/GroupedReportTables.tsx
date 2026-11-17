import { cn } from "@/lib/utils";
import { groupRows, type ColumnDef, type StoreReportRow } from "@/lib/storeReports";

// The rows as separate tables: the department as a heading and, for "departmentCategory", each category
// with its own table (the layout of the printed Store Stock Position and Shortage Report).
export function GroupedReportTables({
    rows,
    columns,
    emptyText,
    variant = "screen",
    by = "departmentCategory",
}: {
    rows: StoreReportRow[];
    columns: ColumnDef[];
    emptyText: string;
    variant?: "screen" | "print";
    by?: "department" | "departmentCategory" | "vendor";
}) {
    if (rows.length === 0) {
        return <p className="py-10 text-center text-sm text-zinc-500">{emptyText}</p>;
    }

    const alignClass = (align?: "left" | "center" | "right") =>
        align === "center" ? "text-center" : align === "right" ? "text-right" : "text-left";

    return (
        <div className="text-black">
            {groupRows(rows, by).map((group) => (
                <section key={group.department} className="mb-6">
                    <h2
                        className={cn(
                            "mb-1 font-bold",
                            by === "vendor" ? "text-sm uppercase tracking-wide text-primary-700" : "text-lg underline"
                        )}
                    >
                        {group.department}
                    </h2>
                    {group.categories.map((section) => (
                        <div key={section.category} className="mb-4">
                            {by === "departmentCategory" && (
                                <h3 className="mb-1 text-sm font-bold uppercase tracking-wide text-primary-700">{section.category}</h3>
                            )}
                            <div className="overflow-x-auto">
                                <table className="w-full border-collapse border border-zinc-500 bg-white text-[13px]">
                                    <thead>
                                        <tr className="bg-[#e4e4e4]">
                                            {columns.map((column) => (
                                                <th
                                                    key={column.header}
                                                    className={cn("border border-zinc-500 px-2 py-1 font-semibold", alignClass(column.align))}
                                                >
                                                    {column.header}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {section.rows.map((row, index) => (
                                            <tr key={index} className={variant === "screen" ? "hover:bg-primary-50" : ""}>
                                                {columns.map((column) => (
                                                    <td key={column.header} className={cn("border border-zinc-400 px-2 py-0.5", alignClass(column.align))}>
                                                        {column.render(row)}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                            {by === "vendor" && <p className="mt-0.5 text-center text-[13px] font-semibold">{section.rows.length}</p>}
                        </div>
                    ))}
                </section>
            ))}
        </div>
    );
}
