"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@iconify/react";
import toast from "react-hot-toast";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import useDebounce from "@/hooks/useDebounce";
import type { ViewAllColumn } from "@/components/ui/ViewAllModal";

const PAGE_SIZE = 50;

interface PageResult<T> {
  items: T[];
  hasMore: boolean;
  nextCursor: number | null;
}

// The cache key of one master list. Use the same key to refresh the list after a Save.
export const masterListKey = (name: string) => ["master-list", name] as const;

// After a Save the View All list is out of date: it is dropped, and read again the next time it is opened.
export function useRefreshMasterList(name: string) {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: masterListKey(name) });
}

interface InfiniteViewAllModalProps<T extends Record<string, unknown>> {
  isOpen: boolean;
  title: string;
  // the list address, for example "/cities". It is called with ?limit=&cursor=&q=
  endpoint: string;
  // the cache name of this list
  name: string;
  columns: ViewAllColumn<T>[];
  // changes a row of the server into the row of the screen (for example adds the province name)
  mapRow?: (row: T) => T;
  onClose: () => void;
  onRowSelect?: (row: T) => void;
  // a picker (choose a vendor / item) has no Delete column
  hideActions?: boolean;
  // what to say when the list is empty
  emptyMessage?: string;
  // extra filters sent with every request (for example the vendor). The list is read fresh each time it is opened.
  extraParams?: Record<string, string | number | undefined>;
}

// View All with infinite scroll: only the first page is read from the server; the next page is read when the end
// of the list comes into view. The search is done by the server (on the whole table), after a short pause in typing.
export function InfiniteViewAllModal<T extends Record<string, unknown>>({
  isOpen,
  title,
  endpoint,
  name,
  columns,
  mapRow,
  onClose,
  onRowSelect,
  hideActions = false,
  emptyMessage = "No records found.",
  extraParams,
}: InfiniteViewAllModalProps<T>) {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 350).trim();
  const scrollRef = useRef<HTMLDivElement>(null);
  // how many rows are on the screen; the pages that are read in advance wait in the cache, not on the screen
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // the row that, when it comes into view, shows the next page
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const loadedCount = useRef(0);
  const queryClient = useQueryClient();

  const query = useInfiniteQuery({
    queryKey: extraParams
      ? [...masterListKey(name), "filtered", JSON.stringify(extraParams), debouncedSearch]
      : [...masterListKey(name), debouncedSearch],
    enabled: isOpen,
    initialPageParam: null as number | null,
    queryFn: async ({ pageParam }): Promise<PageResult<T>> => {
      const { data } = await api.get(endpoint, {
        params: { ...extraParams, limit: PAGE_SIZE, cursor: pageParam ?? undefined, q: debouncedSearch || undefined, _ts: Date.now() },
      });
      // A server that does not page this list yet (an older version) sends the whole list as an array: it is one
      // page that has no more. A page without rows is an empty page. (The screen never gets an empty row.)
      const payload = data.data;
      if (Array.isArray(payload)) return { items: payload as T[], hasMore: false, nextCursor: null };
      return { items: (payload?.items ?? []) as T[], hasMore: Boolean(payload?.hasMore), nextCursor: payload?.nextCursor ?? null };
    },
    getNextPageParam: (lastPage) => (lastPage.hasMore ? lastPage.nextCursor : undefined),
    // a list that depends on other documents (what is still pending) is read again each time it is opened
    staleTime: extraParams ? 0 : 30_000,
    placeholderData: (previous) => previous,
  });

  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  const rawRows = new Map<T, T>();
  const allRows = (query.data?.pages.flatMap((page) => page.items ?? []) ?? []).filter(Boolean).map((raw) => {
    const row = mapRow ? mapRow(raw) : raw;
    rawRows.set(row, raw);
    return row;
  });
  const loadedLength = allRows.length;
  useEffect(() => {
    loadedCount.current = loadedLength;
  }, [loadedLength]);
  const rows = allRows.slice(0, visibleCount);
  // the row about 60% down the screen: when the user scrolls to it, the next page (already read) is shown
  const triggerIndex = Math.max(0, rows.length - Math.ceil(PAGE_SIZE * 0.4));
  const waitingForMore = visibleCount > allRows.length && (isFetchingNextPage || hasNextPage);

  // always keep one page read in advance, in the background: the user never waits at the end of the list
  const fetchFailed = query.isFetchNextPageError;
  useEffect(() => {
    if (!isOpen || !hasNextPage || isFetchingNextPage || fetchFailed) return;
    if (allRows.length - visibleCount < PAGE_SIZE) void fetchNextPage();
  }, [isOpen, hasNextPage, isFetchingNextPage, fetchFailed, fetchNextPage, allRows.length, visibleCount]);

  // the user reached the trigger row: show the next page (it is already here) and the page after it is read next
  useEffect(() => {
    const root = scrollRef.current;
    if (!isOpen || !trigger || !root) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries[0]?.isIntersecting) return;
        // when the screen is already ahead of what has arrived, wait for it (do not run further ahead)
        setVisibleCount((count) => (count > loadedCount.current ? count : count + PAGE_SIZE));
      },
      { root }
    );
    observer.observe(trigger);
    return () => observer.disconnect();
  }, [isOpen, trigger]);

  if (!isOpen) return null;

  const isFirstLoad = query.isPending;
  const errorMessage = query.isError
    ? ((query.error as { response?: { data?: { message?: string } } })?.response?.data?.message ?? "Failed to fetch records")
    : "";

  const cell = (row: T, column: ViewAllColumn<T>): ReactNode =>
    column.render ? column.render(row) : String(row[column.key] ?? "-");

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
              setVisibleCount(PAGE_SIZE);
            }}
            placeholder="Search..."
            className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm text-zinc-900 outline-none focus:border-primary-400"
            aria-label="Search records"
          />
        </div>

        <div ref={scrollRef} className="min-h-56 flex-1 overflow-auto">
          {isFirstLoad ? (
            <div className="space-y-3 p-4">
              {Array.from({ length: 6 }).map((_, index) => (
                <span key={index} className="block h-5 animate-pulse rounded bg-zinc-200" />
              ))}
            </div>
          ) : errorMessage ? (
            <p className="p-8 text-center text-sm text-red-500">{errorMessage}</p>
          ) : rows.length === 0 ? (
            <p className="p-8 text-center text-sm text-zinc-500">{emptyMessage}</p>
          ) : (
            <table className="w-full min-w-[420px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-zinc-100 text-zinc-700">
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className="border-b border-zinc-200 px-4 py-3 font-semibold">
                      {column.header}
                    </th>
                  ))}
                  {!hideActions && (
                    <th className="border-b border-zinc-200 px-4 py-3 text-center font-semibold">Actions</th>
                  )}
                </tr>
              </thead>
              <tbody className={query.isPlaceholderData ? "opacity-60" : ""}>
                {rows.map((row, rowIndex) => (
                  <tr
                    key={String(row.id ?? rowIndex)}
                    ref={rowIndex === triggerIndex ? setTrigger : undefined}
                    onClick={() => {
                      // The row is the record itself: the page that opens it does not need to read it again.
                      // Not for a list with extra filters: its rows are something else (for example the rejected
                      // items of a vendor, whose "id" is the item), and must never be taken for the record.
                      if (!extraParams) {
                        queryClient.setQueryData([...masterListKey(name), "item", String(row.id)], rawRows.get(row));
                      }
                      onRowSelect?.(row);
                    }}
                    className={onRowSelect ? "cursor-pointer hover:bg-primary-50" : ""}
                  >
                    {columns.map((column) => (
                      <td
                        key={column.key}
                        className={`border-b border-zinc-100 px-4 py-3 text-zinc-800 ${/mail/i.test(column.key) ? "normal-case" : ""}`}
                      >
                        {cell(row, column)}
                      </td>
                    ))}
                    {!hideActions && (
                      <td className="border-b border-zinc-100 px-4 py-3">
                        <div className="flex items-center justify-center gap-3">
                          <button
                            type="button"
                            title="Delete"
                            aria-label="Delete"
                            onClick={(event) => {
                              event.stopPropagation();
                              // Deleting records is not available yet (the server refuses it as well)
                              toast("Delete functionality will be added soon", { id: "delete-soon", icon: "🚧" });
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
          {waitingForMore && <p className="py-3 text-center text-xs text-zinc-500">Loading more...</p>}
        </div>

        <div className="flex items-center justify-between border-t border-zinc-200 px-4 py-3 text-xs text-zinc-500">
          <span>
            {rows.length} record{rows.length === 1 ? "" : "s"}
            {hasNextPage || allRows.length > rows.length ? " · scroll down for more" : ""}
          </span>
        </div>
      </div>
    </div>
  );
}
