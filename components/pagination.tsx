import { ChevronLeft, ChevronRight } from "lucide-react";

interface PaginationProps {
  page: number;
  totalPages: number;
  count: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}

export function Pagination({
  page,
  totalPages,
  count,
  pageSize,
  onPageChange,
}: PaginationProps) {
  const from = count === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, count);
  const safeTotalPages = Math.max(1, totalPages);

  return (
    <div className="flex items-center justify-between border-t border-gray-100 px-4 py-3 text-xs text-gray-500">
      <p>
        {count === 0
          ? "0 results"
          : `${from.toLocaleString()}–${to.toLocaleString()} of ${count.toLocaleString()}`}
      </p>
      <div className="flex items-center gap-2">
        <button
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          <ChevronLeft size={14} /> Previous
        </button>
        <span>
          {page} / {safeTotalPages}
        </span>
        <button
          disabled={page >= safeTotalPages}
          onClick={() => onPageChange(page + 1)}
          className="flex items-center gap-1 rounded-lg border border-gray-200 px-2.5 py-1.5 transition-colors hover:bg-gray-50 disabled:opacity-40"
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}
