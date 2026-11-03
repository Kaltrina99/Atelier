import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "./client";
import type { EntityBase, PagedResult, PageQuery } from "./types";

const toQueryString = (q: PageQuery) => {
  const params = new URLSearchParams();
  Object.entries(q).forEach(([k, v]) => v !== undefined && v !== "" && params.set(k, String(v)));
  const s = params.toString();
  return s ? `?${s}` : "";
};

/**
 * One call gives a feature its whole data layer:
 *   export const productsApi = createCrud<Product, ProductInput>("products");
 *   const { data } = productsApi.useList({ page: 1 });
 */
export function createCrud<TItem extends EntityBase, TInput>(resource: string) {
  const base = `/api/${resource}`;
  const keys = {
    all: [resource] as const,
    list: (q: PageQuery) => [resource, "list", q] as const,
    detail: (id: string) => [resource, "detail", id] as const,
  };

  const useInvalidate = () => {
    const qc = useQueryClient();
    return () => qc.invalidateQueries({ queryKey: keys.all });
  };

  return {
    keys,

    useList: (q: PageQuery = {}) =>
      useQuery({
        queryKey: keys.list(q),
        queryFn: () => api.get<PagedResult<TItem>>(base + toQueryString(q)),
        placeholderData: keepPreviousData,
      }),

    useOne: (id: string | undefined) =>
      useQuery({
        queryKey: keys.detail(id ?? ""),
        queryFn: () => api.get<TItem>(`${base}/${id}`),
        enabled: !!id,
      }),

    useCreate: () => {
      const invalidate = useInvalidate();
      return useMutation({ mutationFn: (input: TInput) => api.post<TItem>(base, input), onSuccess: invalidate });
    },

    useUpdate: () => {
      const invalidate = useInvalidate();
      return useMutation({
        mutationFn: ({ id, input }: { id: string; input: TInput }) => api.put<TItem>(`${base}/${id}`, input),
        onSuccess: invalidate,
      });
    },

    useRemove: () => {
      const invalidate = useInvalidate();
      return useMutation({ mutationFn: (id: string) => api.delete(`${base}/${id}`), onSuccess: invalidate });
    },
  };
}

export type CrudApi<TItem extends EntityBase, TInput> = ReturnType<typeof createCrud<TItem, TInput>>;
