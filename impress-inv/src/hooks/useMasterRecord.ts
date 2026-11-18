import { useQueryClient } from "@tanstack/react-query";
import api from "@/lib/axios";
import { masterListKey } from "@/components/ui/InfiniteViewAllModal";

const FRESH_FOR = 2 * 60 * 1000;

// One record by its id, with a cache (TanStack Query): an id that was opened a moment ago opens at once, without the
// server. The record next to it (id - 1, id + 1) is read quietly in the background, so the next one is ready as well.
// The cache is dropped by useRefreshMasterList(name) after a Save.
export function useMasterRecord(name: string, endpoint: string) {
  const queryClient = useQueryClient();

  const options = (id: string | number) => ({
    queryKey: [...masterListKey(name), "item", String(id)],
    queryFn: async () => (await api.get(`${endpoint}/${id}`, { params: { _ts: Date.now() } })).data.data,
    staleTime: FRESH_FOR,
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fetchOne = (id: string | number): Promise<any> => queryClient.fetchQuery(options(id));

  // maxId: the next new number; ids from 1 up to maxId - 1 are real records
  const prefetchNear = (id: string | number, maxId: number) => {
    for (const near of [Number(id) - 1, Number(id) + 1]) {
      if (near >= 1 && near < maxId) void queryClient.prefetchQuery(options(near));
    }
  };

  return { fetchOne, prefetchNear };
}
