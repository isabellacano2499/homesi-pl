import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export type OAGroupRow = {
  group_key: string;
  check_description_3: string | null;
  vendor: string | null;
  branches: string[];
  years: number[];
  months: string[];
  category: string | null;
  position: string | null;
  branch_allocation: string | null;
  cc_labels: string[];
  tx_count: number;
  tx_count_unassigned: number;
};

export type OABlock = {
  block_key: string;
  block_type: "roster" | "vendor";
  rows: OAGroupRow[];
};

const SELECT =
  "id,month,year,branch,check_description_2,check_description_3," +
  "vendor,category,position,branch_allocation," +
  "cost_center_id,cost_center_status,cost_centers(name)";

const MONTH_ORDER = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

export async function GET() {
  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase
      .from("pl_transactions")
      .select(SELECT)
      .eq("source", "offshore_allocations")
      .range(offset, offset + 999);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  type WRow = {
    group_key: string;
    check_description_3: string | null;
    vendor: string | null;
    branches: Set<string>;
    years: Set<number>;
    months: Set<string>;
    category: string | null;
    position: string | null;
    branch_allocation: string | null;
    cc_labels: Set<string>;
    tx_count: number;
    tx_count_unassigned: number;
  };
  type WBlock = {
    block_key: string;
    block_type: "roster" | "vendor";
    rows: Map<string, WRow>;
  };

  const blockMap = new Map<string, WBlock>();

  for (const tx of all) {
    const cd2 = (tx.check_description_2 ?? "").trim() || "(No Description 2)";
    const blockType: "roster" | "vendor" = cd2.toLowerCase().includes("roster") ? "roster" : "vendor";

    let block = blockMap.get(cd2);
    if (!block) {
      block = { block_key: cd2, block_type: blockType, rows: new Map() };
      blockMap.set(cd2, block);
    }

    const cd3 = (tx.check_description_3 ?? "").trim() || null;
    const vendor = (tx.vendor ?? "").trim() || null;
    const group_key =
      blockType === "roster"
        ? (cd3 ?? "(No Description 3)")
        : (vendor ?? "(Unknown Vendor)");

    let row = block.rows.get(group_key);
    if (!row) {
      row = {
        group_key,
        check_description_3: blockType === "roster" ? (cd3 ?? "(No Description 3)") : cd3,
        vendor: blockType === "vendor" ? (vendor ?? "(Unknown Vendor)") : vendor,
        branches: new Set(),
        years: new Set(),
        months: new Set(),
        category: null,
        position: null,
        branch_allocation: null,
        cc_labels: new Set(),
        tx_count: 0,
        tx_count_unassigned: 0,
      };
      block.rows.set(group_key, row);
    }

    if (tx.branch) row.branches.add(tx.branch);
    if (tx.year != null) row.years.add(tx.year);
    if (tx.month) row.months.add(tx.month);
    if (!row.category && tx.category) row.category = tx.category;
    if (!row.position && tx.position) row.position = tx.position;
    if (!row.branch_allocation && tx.branch_allocation) row.branch_allocation = tx.branch_allocation;
    if (tx.cost_centers?.name) row.cc_labels.add(tx.cost_centers.name);
    row.tx_count++;
    if (!tx.cost_center_id || tx.cost_center_status === "unassigned") row.tx_count_unassigned++;
  }

  const rosters: OABlock[] = [];
  const vendors: OABlock[] = [];

  for (const wb of blockMap.values()) {
    const rows: OAGroupRow[] = [...wb.rows.values()]
      .map((r) => ({
        group_key: r.group_key,
        check_description_3: r.check_description_3,
        vendor: r.vendor,
        branches: [...r.branches].sort(),
        years: [...r.years].sort((a, b) => a - b),
        months: MONTH_ORDER.filter((m) => r.months.has(m)),
        category: r.category,
        position: r.position,
        branch_allocation: r.branch_allocation,
        cc_labels: [...r.cc_labels].sort(),
        tx_count: r.tx_count,
        tx_count_unassigned: r.tx_count_unassigned,
      }))
      .sort((a, b) => a.group_key.localeCompare(b.group_key));

    const block: OABlock = { block_key: wb.block_key, block_type: wb.block_type, rows };
    if (wb.block_type === "roster") rosters.push(block);
    else vendors.push(block);
  }

  rosters.sort((a, b) => a.block_key.localeCompare(b.block_key));
  vendors.sort((a, b) => a.block_key.localeCompare(b.block_key));

  return NextResponse.json([...rosters, ...vendors] as OABlock[]);
}
