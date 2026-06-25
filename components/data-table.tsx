interface Column {
  label: string;
  className?: string;
}

interface DataTableProps {
  columns: Column[];
  loading?: boolean;
  emptyMessage?: string;
  children: React.ReactNode;
}

/**
 * Provides the outer shell for all data tables: overflow container, consistent
 * header styling, loading spinner, and empty-state message. Column definitions
 * drive the <thead>; row rendering is left to the caller as <tbody> children.
 */
export function DataTable({
  columns,
  loading = false,
  emptyMessage = "No results",
  children,
}: DataTableProps) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50 text-left text-gray-500">
              {columns.map((col) => (
                <th
                  key={col.label}
                  className={[
                    "whitespace-nowrap px-4 py-3 font-medium",
                    col.className ?? "",
                  ].join(" ")}
                >
                  {col.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-gray-400"
                >
                  <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-blue-300 border-t-blue-600" />
                </td>
              </tr>
            ) : (
              children
            )}
            {!loading && !children && (
              <tr>
                <td
                  colSpan={columns.length}
                  className="py-10 text-center text-gray-400"
                >
                  {emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
