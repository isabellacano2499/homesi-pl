export function downloadCSV(
  filename: string,
  data: Record<string, unknown>[],
  columns: { key: string; label: string }[]
): void {
  const header = columns.map((c) => JSON.stringify(c.label)).join(",");
  const rows = data.map((row) =>
    columns
      .map((c) => {
        const v = row[c.key];
        if (v == null) return '""';
        return JSON.stringify(String(v));
      })
      .join(",")
  );
  const csv = "﻿" + [header, ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
