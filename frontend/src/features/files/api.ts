import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/shared/api/client";

export interface StoredFile {
  key: string;
  fileName: string;
  size: number;
  lastModified: string;
}

const key = ["files"] as const;

export const filesApi = {
  useList: () => useQuery({ queryKey: key, queryFn: () => api.get<StoredFile[]>("/api/files") }),

  useUpload: () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (file: File) => api.upload<StoredFile>("/api/files", file),
      onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    });
  },

  useRemove: () => {
    const qc = useQueryClient();
    return useMutation({
      mutationFn: (fileKey: string) => api.delete(`/api/files?key=${encodeURIComponent(fileKey)}`),
      onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    });
  },

  downloadUrl: (fileKey: string) => api.url(`/api/files/download?key=${encodeURIComponent(fileKey)}`),
};
