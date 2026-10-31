import { useState } from "react";
import api from "@/lib/axios";

export function useViewAll<T extends Record<string, unknown>>(endpoint: string) {
  const [isOpen, setIsOpen] = useState(false);
  const [rows, setRows] = useState<T[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const open = async () => {
    setIsOpen(true);
    setIsLoading(true);
    setError("");
    try {
      const response = await api.get(endpoint);
      setRows((response.data.data || []) as T[]);
    } catch (requestError: unknown) {
      const message = requestError as { response?: { data?: { message?: string } } };
      setError(message.response?.data?.message || "Failed to fetch records");
    } finally {
      setIsLoading(false);
    }
  };

  const close = () => setIsOpen(false);

  return { isOpen, rows, isLoading, error, open, close };
}
