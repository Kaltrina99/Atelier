/** Mirrors Common/Paging on the backend. */
export interface PageQuery {
  page?: number;
  pageSize?: number;
  search?: string;
}

export interface PagedResult<T> {
  items: T[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
}

/** Fields every backend Entity has. */
export interface EntityBase {
  id: string;
  createdAt: string;
  updatedAt: string;
}
