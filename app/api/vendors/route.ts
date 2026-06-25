import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { VendorSummary } from "@/types";

export const dynamic = "force-dynamic";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export async function GET() {
  const supabase = createServerClient();

  // Fetch all relevant fields in pages
  const all: {
    vendor: string;
    branch: string | null;
    month: string | null;
    gl_code: string | null;
    gl_name: string | null;
    cost_center_id: string | null;
    cost_center_status: string | null;
  }[] = [];

  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("pl_transactions")
      .select("vendor,branch,month,gl_code,gl_name,cost_center_id,cost_center_status")
      .not("vendor", "is", null)
      .neq("vendor", "")
      .range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    all.push(...(data as typeof all));
    if (data.length < 1000) break;
    offset += 1000;
  }

  // Fetch cost center names
  const { data: ccs } = await supabase.from("cost_centers").select("id,name");
  const ccMap = new Map<string, string>((ccs ?? []).map((c) => [c.id, c.name]));

  type Acc = {
    branches: Set<string>;
    months: Set<string>;
    gl_items: Map<string, { gl_code: string; gl_name: string }>;
    cc_labels: Set<string>;
  };

  // Normalize vendor key: trim + collapse internal spaces for dedup
  const byVendor = new Map<string, Acc>();
  const displayName = new Map<string, string>(); // normalized key → first seen display name

  for (const row of all) {
    if (!row.vendor) continue;
    const key = row.vendor.trim().replace(/\s+/g, " ").toLowerCase();
    if (!key) continue;

    if (!byVendor.has(key)) {
      byVendor.set(key, {
        branches: new Set(),
        months: new Set(),
        gl_items: new Map(),
        cc_labels: new Set(),
      });
      displayName.set(key, row.vendor.trim());
    }

    const acc = byVendor.get(key)!;
    if (row.branch) acc.branches.add(row.branch.trim());
    if (row.month) acc.months.add(row.month);
    if (row.gl_code) {
      acc.gl_items.set(row.gl_code, { gl_code: row.gl_code, gl_name: row.gl_name ?? "" });
    }
    if (row.cost_center_status === "unassigned") {
      acc.cc_labels.add("Unassigned");
    } else if (row.cost_center_status === "conflict") {
      acc.cc_labels.add("Conflict");
    } else if (row.cost_center_id) {
      acc.cc_labels.add(ccMap.get(row.cost_center_id) ?? row.cost_center_id);
    } else {
      acc.cc_labels.add("Unassigned");
    }
  }

  const result: VendorSummary[] = [...byVendor.entries()]
    .map(([key, acc]) => ({
      vendor: displayName.get(key) ?? key,
      branches: [...acc.branches].sort(),
      months: MONTH_ORDER.filter((m) => acc.months.has(m)),
      gl_items: [...acc.gl_items.values()].sort((a, b) => a.gl_code.localeCompare(b.gl_code)),
      cost_centers: [...acc.cc_labels].sort(),
    }))
    .sort((a, b) => a.vendor.localeCompare(b.vendor));

  return NextResponse.json(result);
}
