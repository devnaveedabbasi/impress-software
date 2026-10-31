"use client";

import { useMemo, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import { Button } from "@/components/ui/Button";
import useDebounce from "@/hooks/useDebounce";
import { useViewAll } from "@/hooks/useViewAll";

export interface ViewAllColumn<T> {
  key: string;
  header: string;
  render?: (row: T) => ReactNode;
}

interface ViewAllModalProps<T extends Record<string, unknown>> {
  isOpen: boolean;
  title: string;
  rows: T[];
  columns: ViewAllColumn<T>[];
  searchKeys: (keyof T)[];
  isLoading?: boolean;
  error?: string;
  pageSize?: number;
  onClose: () => void;
  onRowSelect?: (row: T) => void;
  onDelete?: (row: T) => void;
}

export function ViewAllModal<T extends Record<string, unknown>>({
  isOpen,
  title,
  rows,
  columns,
  searchKeys,
  isLoading = false,
  error,
  pageSize = 8,
  onClose,
  onRowSelect,
  onDelete,
}: ViewAllModalProps<T>) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebounce(search, 300);

  const filteredRows = useMemo(() => {
    const query = debouncedSearch.trim().toLowerCase();
    if (!query) return rows;

    return rows.filter((row) =>
      searchKeys.some((key) => String(row[key] ?? "").toLowerCase().includes(query))
    );
  }, [rows, debouncedSearch, searchKeys]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const visibleRows = filteredRows.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="view-all-modal-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="flex max-h-[min(680px,calc(100vh-2rem))] w-full max-w-3xl flex-col overflow-hidden rounded-lg bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4">
          <h2 id="view-all-modal-title" className="text-lg font-semibold text-zinc-900">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="text-2xl leading-none text-zinc-500 hover:text-zinc-900"
          >
            ×
          </button>
        </div>

        <div className="border-b border-zinc-200 p-4">
          <input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(1);
            }}
            placeholder="Search..."
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary-400"
            aria-label="Search records"
          />
        </div>

        <div className="min-h-56 overflow-auto">
          {isLoading ? (
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <thead className="bg-zinc-100">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="border-b border-zinc-200 px-4 py-3">
                      <span className="block h-4 w-24 animate-pulse rounded bg-zinc-300" />
                    </th>
                  ))}
                  {onDelete && (
                    <th className="border-b border-zinc-200 px-4 py-3">
                      <span className="mx-auto block h-4 w-16 animate-pulse rounded bg-zinc-300" />
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {Array.from({ length: 6 }).map((_, rowIndex) => (
                  <tr key={rowIndex}>
                    {Array.from({ length: columns.length + (onDelete ? 1 : 0) }).map((__, columnIndex) => (
                      <td key={columnIndex} className="border-b border-zinc-100 px-4 py-4">
                        <span className="block h-4 animate-pulse rounded bg-zinc-200" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          ) : error ? (
            <p className="p-8 text-center text-sm text-red-500">{error}</p>
          ) : visibleRows.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">No records found.</p>
          ) : (
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-zinc-700">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="border-b border-zinc-200 px-4 py-3 font-semibold">
                      {column.header}
                    </th>
                  ))}
                  {onDelete && (
                    <th className="border-b border-zinc-200 px-4 py-3 text-center font-semibold">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visibleRows.map((row, rowIndex) => (
                  <tr
                    key={String(row.id ?? rowIndex)}
                    onClick={() => onRowSelect?.(row)}
                    className={onRowSelect ? "cursor-pointer hover:bg-primary-50" : ""}
                  >
                    {columns.map((column) => (
                      <td key={column.key} className="border-b border-zinc-100 px-4 py-3 text-zinc-800">
                        {column.render ? column.render(row) : String(row[column.key] ?? "-")}
                      </td>
                    ))}
                    {onDelete && (
                      <td className="border-b border-zinc-100 px-4 py-3">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            title="Delete"
                            aria-label="Delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              onDelete(row);
                            }}
                            className="text-red-500 transition-colors hover:text-red-700"
                          >
                            <Icon icon="mdi:trash-can-outline" className="h-5 w-5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-200 px-4 py-3">
          <span className="text-xs text-zinc-500">
            {filteredRows.length === 0 ? "0 records" : `${(currentPage - 1) * pageSize + 1}-${Math.min(currentPage * pageSize, filteredRows.length)} of ${filteredRows.length}`}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              shape="rounded"
              onClick={() => setPage((current) => Math.max(1, current - 1))}
              disabled={currentPage === 1}
            >
              Previous
            </Button>
            <span className="min-w-16 text-center text-xs text-zinc-600">
              {currentPage} / {totalPages}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              shape="rounded"
              onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
              disabled={currentPage === totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface ViewAllResourceProps<T extends Record<string, unknown>> {
  endpoint: string;
  title: string;
  columns: ViewAllColumn<T>[];
  searchKeys: (keyof T)[];
  canView: boolean;
  onSelectId: (id: number) => void;
}

export function ViewAllResource<T extends Record<string, unknown>>({
  endpoint,
  title,
  columns,
  searchKeys,
  canView,
  onSelectId,
}: ViewAllResourceProps<T>) {
  const viewAll = useViewAll<T>(endpoint);

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        shape="rounded"
        onClick={viewAll.open}
        disabled={!canView}
        className="border border-zinc-400 bg-white px-6 hover:bg-zinc-50"
      >
        View All
      </Button>
      <ViewAllModal
        key={viewAll.isOpen ? "open" : "closed"}
        isOpen={viewAll.isOpen}
        title={title}
        rows={viewAll.rows}
        columns={columns}
        searchKeys={searchKeys}
        isLoading={viewAll.isLoading}
        error={viewAll.error}
        onClose={viewAll.close}
        onRowSelect={(row) => {
          viewAll.close();
          onSelectId(Number(row.id));
        }}
        onDelete={() => undefined}
      />
    </>
  );
}