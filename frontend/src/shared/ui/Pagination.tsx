export function Pagination({ page, totalPages, totalCount, onChange }: {
  page: number;
  totalPages: number;
  totalCount: number;
  onChange: (page: number) => void;
}) {
  if (totalCount === 0) return null;
  return (
    <div className="pagination">
      <span>{totalCount} total</span>
      <div className="pagination-buttons">
        <button className="btn btn-ghost" disabled={page <= 1} onClick={() => onChange(page - 1)}>Previous</button>
        <span>Page {page} of {Math.max(totalPages, 1)}</span>
        <button className="btn btn-ghost" disabled={page >= totalPages} onClick={() => onChange(page + 1)}>Next</button>
      </div>
    </div>
  );
}
