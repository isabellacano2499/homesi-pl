export const dynamic = "force-dynamic";

import { createServerClient } from "@/lib/supabase-server";
import { Upload, Table2, Database, CheckCircle2 } from "lucide-react";
import Link from "next/link";
import type { PLUpload } from "@/types";

async function getStats() {
  const supabase = createServerClient();

  const [
    { count: totalTransactions },
    { count: uncategorized },
    { count: totalUploads },
    { count: totalGLMappings },
  ] = await Promise.all([
    supabase.from("pl_transactions").select("id", { count: "exact", head: true }),
    supabase
      .from("pl_transactions")
      .select("id", { count: "exact", head: true })
      .is("category_1", null),
    supabase.from("pl_uploads").select("id", { count: "exact", head: true }),
    supabase.from("gl_mapping").select("id", { count: "exact", head: true }),
  ]);

  const { data: recentUploads } = await supabase
    .from("pl_uploads")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(5);

  return {
    totalTransactions: totalTransactions ?? 0,
    uncategorized: uncategorized ?? 0,
    totalUploads: totalUploads ?? 0,
    totalGLMappings: totalGLMappings ?? 0,
    recentUploads: (recentUploads ?? []) as PLUpload[],
  };
}

function StatCard({
  label,
  value,
  icon: Icon,
  sub,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm text-gray-500">{label}</p>
          <p className="mt-1 text-2xl font-bold text-gray-900">
            {value.toLocaleString()}
          </p>
          {sub && <p className="mt-1 text-xs text-gray-400">{sub}</p>}
        </div>
        <div className="rounded-lg bg-blue-50 p-2">
          <Icon size={20} className="text-blue-600" />
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: PLUpload["status"] }) {
  if (status === "completed")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
        <CheckCircle2 size={10} /> Completed
      </span>
    );
  if (status === "error")
    return (
      <span className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700">
        Error
      </span>
    );
  return (
    <span className="inline-flex rounded-full bg-yellow-50 px-2 py-0.5 text-xs font-medium text-yellow-700">
      Processing
    </span>
  );
}

export default async function DashboardPage() {
  const stats = await getStats();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-gray-900">Dashboard</h2>
        <p className="text-sm text-gray-500">General P&L process overview</p>
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Total transactions" value={stats.totalTransactions} icon={Table2} />
        <StatCard
          label="Uncategorized"
          value={stats.uncategorized}
          icon={Table2}
          sub="GL Code without mapping"
        />
        <StatCard label="Files uploaded" value={stats.totalUploads} icon={Upload} />
        <StatCard label="GL Codes mapped" value={stats.totalGLMappings} icon={Database} />
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-gray-100 px-5 py-4">
          <h3 className="font-semibold text-gray-900">Recent uploads</h3>
          <Link
            href="/upload"
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-blue-700"
          >
            <Upload size={13} /> New upload
          </Link>
        </div>
        {stats.recentUploads.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-gray-400">
            No uploads yet. Upload your first P&L.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs text-gray-400">
                {["File", "Date", "Rows", "Status"].map((h) => (
                  <th key={h} className="px-5 py-3 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {stats.recentUploads.map((u) => (
                <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                  <td className="px-5 py-3 font-medium text-gray-800">{u.file_name}</td>
                  <td className="px-5 py-3 text-gray-500">
                    {new Date(u.uploaded_at).toLocaleString("en-US", {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </td>
                  <td className="px-5 py-3 text-gray-500">
                    {u.row_count?.toLocaleString() ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <StatusBadge status={u.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
