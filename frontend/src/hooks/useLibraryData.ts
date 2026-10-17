"use client";

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/api-config";
import { fetchWithTimeout } from "@/lib/http";

export type LibraryData = { campaigns: any[]; products: any[]; total: number };

export type LibraryParams = { skip?: number; limit?: number; campaign_id?: string; searchKeyword?: string; sortOption?: string };

export function libraryQuery(userId: string | undefined, params: LibraryParams = {}) {
  return {
    queryKey: ["member", userId, "library", params] as const,
    staleTime: 30_000,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<LibraryData> => {
      const search = new URLSearchParams();
      Object.entries(params).forEach(([key, value]) => { if (value !== undefined && value !== "") search.set(key, String(value)); });
      const response = await fetchWithTimeout(`${API_BASE_URL}/library${search.size ? `?${search}` : ""}`, {
        signal, headers: { Authorization: `Bearer ${localStorage.getItem("rf_token")}` },
      });
      if (!response.ok) {
        const error = await response.json().catch(() => null);
        throw new Error(typeof error?.detail === 'string' ? error.detail : "Unable to load the library");
      }
      return response.json();
    },
  };
}

export function useLibraryData(params: LibraryParams = {}) {
  const { user } = useAuth();
  return useQuery({ ...libraryQuery(user?.id, params), enabled: Boolean(user) });
}
