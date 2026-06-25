import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { VendorSummary } from "@/types";

export const dynamic = "force-dynamic";

const TOO_MANY = 2000;

export async function GET() {
  const supabase = createServerClient();

  // Count distinct vendors first
  const { count } = await supabase
    .from("pl_transactions")
    .select("vendor", { count: "exact", head: true })
    .not("vendor", "is", null)
    .neq("vendor", "");

  if ((count ?? 0) > TOO_MANY) {
    return NextResponse.json(
      { tooMany: true, count, message: `${count} unique vendors found — over the ${TOO_MANY} limit. Contact the developer to optimize this view.` },
      { status: 200 }
    );
  }

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

  // Aggregate by vendor
  type Acc = {
    branches: Set<string>;
    months: Set<string>;
    gl_keys: Set<string>;
    gl_items: Map<string, { gl_code: string; gl_name: string }>;
    cc_labels: Set<string>;
  };
  const byVendor = new Map<string, Acc>();

  for (const row of all) {
    if (!row.vendor) continue;
    if (!byVendor.has(row.vendor)) {
      byVendor.set(row.vendor, {
        branches: new Set(),
        months: new Set(),
        gl_keys: new Set(),
        gl_items: new Map(),
        cc_labels: new Set(),
      });
    }
    const acc = byVendor.get(row.vendor)!;
    if (row.branch) acc.branches.add(row.branch);
    if (row.month) acc.months.add(row.month);
    if (row.gl_code) {
      const glKey = row.gl_code;
      if (!acc.gl_items.has(glKey)) {
        acc.gl_items.set(glKey, { gl_code: row.gl_code, gl_name: row.gl_name ?? "" });
      }
    }
    if (row.cost_center_status === "unassigned") {
      acc.cc_labels.add("Unassigned");
    } else if (row.cost_center_status === "conflict") {
      acc.cc_labels.add("Conflict");
    } else if (row.cost_center_id) {
      acc.cc_labels.add(ccMap.get(row.cost_center_id) ?? row.cost_center_id);
    }
  }

  const MONTH_ORDER = [
    "January","February","March","April","May","June",
    "July","August","September","October","November","December",
  ];

  const result: VendorSummary[] = [...byVendor.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([vendor, acc]) => ({
      vendor,
      branches: [...acc.branches].sort(),
      months: MONTH_ORDER.filter((m) => acc.months.has(m)),
      gl_items: [...acc.gl_items.values()].sort((a, b) => a.gl_code.localeCompare(b.gl_code)),
      cost_centers: [...acc.cc_labels].sort(),
    }));

  return NextResponse.json(result);
}
