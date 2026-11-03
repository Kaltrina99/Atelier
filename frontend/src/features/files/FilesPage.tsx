import { useRef, useState } from "react";
import { filesApi } from "./api";

const size = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;
const date = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });

export default function FilesPage() {
  const { data, isLoading, isError, error } = filesApi.useList();
  const upload = filesApi.useUpload();
  const remove = filesApi.useRemove();
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const send = (files: FileList | null) => Array.from(files ?? []).forEach((f) => upload.mutate(f));

  return (
    <div className="page">
      <header className="page-head">
        <h1>Files</h1>
      </header>

      <div
        className={`dropzone ${dragging ? "dragging" : ""}`}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); send(e.dataTransfer.files); }}
      >
        <p>{upload.isPending ? "Uploading…" : "Drop files here, or"}</p>
        <button className="btn btn-primary" onClick={() => input.current?.click()} disabled={upload.isPending}>
          Choose files
        </button>
        <input ref={input} type="file" multiple hidden onChange={(e) => { send(e.target.files); e.target.value = ""; }} />
      </div>

      {upload.isError && <p className="banner-error">{upload.error.message}</p>}
      {isError && <p className="banner-error">{error.message}</p>}

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr><th>Name</th><th className="end">Size</th><th>Uploaded</th><th aria-label="Actions" /></tr>
          </thead>
          <tbody>
            {data?.map((f) => (
              <tr key={f.key}>
                <td><a href={filesApi.downloadUrl(f.key)}>{f.fileName}</a></td>
                <td className="end muted">{size(f.size)}</td>
                <td className="muted">{date.format(new Date(f.lastModified))}</td>
                <td className="end actions">
                  <button
                    className="btn btn-ghost danger"
                    onClick={() => confirm(`Delete ${f.fileName}? This can't be undone.`) && remove.mutate(f.key)}
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {isLoading && <p className="empty">Loading…</p>}
        {data?.length === 0 && <p className="empty">No files yet. Upload one to get started.</p>}
      </div>
    </div>
  );
}
