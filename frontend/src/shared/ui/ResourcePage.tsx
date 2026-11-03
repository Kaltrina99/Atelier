import { useDeferredValue, useState, type ComponentType, type ReactNode } from "react";
import type { CrudApi } from "@/shared/api/crud";
import type { EntityBase } from "@/shared/api/types";
import { Drawer } from "./Drawer";
import { Pagination } from "./Pagination";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
  align?: "start" | "end";
}

export interface FormProps<T> {
  /** undefined = create, otherwise edit */
  item?: T;
  onDone: () => void;
}

/**
 * Generic list + search + paging + create/edit drawer + delete.
 * A feature only supplies its columns and its form.
 */
export function ResourcePage<TItem extends EntityBase, TInput>({ title, singular, api, columns, Form }: {
  title: string;
  singular: string;
  api: CrudApi<TItem, TInput>;
  columns: Column<TItem>[];
  Form: ComponentType<FormProps<TItem>>;
}) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDeferredValue(search);
  const [editing, setEditing] = useState<TItem | "new" | null>(null);

  const { data, isLoading, isError, error } = api.useList({ page, search: deferredSearch });
  const remove = api.useRemove();

  const onDelete = (row: TItem) => {
    if (confirm(`Delete this ${singular.toLowerCase()}? This can't be undone.`)) remove.mutate(row.id);
  };

  return (
    <div className="page">
      <header className="page-head">
        <h1>{title}</h1>
        <button className="btn btn-primary" onClick={() => setEditing("new")}>New {singular.toLowerCase()}</button>
      </header>

      <input
        className="input search"
        type="search"
        placeholder={`Search ${title.toLowerCase()}`}
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
      />

      {isError && <p className="banner-error">{error.message}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              {columns.map((c) => <th key={c.header} className={c.align === "end" ? "end" : ""}>{c.header}</th>)}
              <th aria-label="Actions" />
            </tr>
          </thead>
          <tbody>
            {data?.items.map((row) => (
              <tr key={row.id}>
                {columns.map((c) => <td key={c.header} className={c.align === "end" ? "end" : ""}>{c.cell(row)}</td>)}
                <td className="end actions">
                  <button className="btn btn-ghost" onClick={() => setEditing(row)}>Edit</button>
                  <button className="btn btn-ghost danger" onClick={() => onDelete(row)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="empty">Loading…</p>}
        {data && data.items.length === 0 && (
          <p className="empty">
            {search ? `Nothing matches “${search}”.` : `No ${title.toLowerCase()} yet. Create the first one to get started.`}
          </p>
        )}
      </div>

      {data && <Pagination {...data} onChange={setPage} />}

      <Drawer
        open={editing !== null}
        title={editing === "new" ? `New ${singular.toLowerCase()}` : `Edit ${singular.toLowerCase()}`}
        onClose={() => setEditing(null)}
      >
        {editing !== null && (
          <Form item={editing === "new" ? undefined : editing} onDone={() => setEditing(null)} />
        )}
      </Drawer>
    </div>
  );
}
