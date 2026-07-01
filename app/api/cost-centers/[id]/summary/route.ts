import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

// ─── Pattern extraction ────────────────────────────────────────────────────────
const MONTHS_PAT = "January|February|March|April|May|June|July|August|September|October|November|December";
const EXTRACT_RES = [
  /\s\d{9,12}(?!\d)/,
  new RegExp(`\\s(?:${MONTHS_PAT})\\b`, "i"),
  /\s\d{1,2}\/\d{1,2}\/\d{2,4}/,
];

function extractPattern(desc: string): string {
  const s = desc.trim();
  for (const re of EXTRACT_RES) {
    const m = s.match(re);
    if (m?.index !== undefined) return s.slice(0, m.index).trim();
  }
  return s;
}

// ─── Exported types (used by cc-summary.tsx) ──────────────────────────────────
export type SplitItemData = {
  name: string;
  item_type: "roster_offshore" | "vendor";
  pct_this_cc: number;
  other_ccs: { cc_name: string; pct: number }[];
};

export type Category3Group = {
  category_3: string | null;
  items: SplitItemData[];
};

export type PatternData = {
  pattern: string;
  count: number;
  is_manual: boolean;
  pattern_id: string | null;
};

export type GLPatternGroup = {
  gl_code: string;
  gl_name: string | null;
  patterns: PatternData[];
  total_count: number;
};

export type CategorySubSection =
  | { mode: "split_items"; category_3_groups: Category3Group[] }
  | { mode: "dm_margin"; loan_count: number; gl_code: string; gl_name: string | null }
  | { mode: "patterns"; gl_groups: GLPatternGroup[] };

export type CategoryGroup = {
  category_2: string | null;
  sub_sections: CategorySubSection[];
};

export type SummarySection = {
  is_operational: boolean;
  groups: CategoryGroup[];
};

export type ManualPattern = { id: string; pattern: string; gl_code: string | null };

export type SummaryResponse = {
  sections: SummarySection[];
  manual_patterns: ManualPattern[];
};

// ─── Internal types ────────────────────────────────────────────────────────────
type TxRow = {
  id: string; gl_code: string | null; category_2: string | null; category_3: string | null; category_7: string | null;
  source: string | null; check_description: string | null; check_description_2: string | null;
  check_description_3: string | null; vendor: string | null; loan_number: string | null;
  loan_number_incomplete: boolean | null; operational_pct: number;
};

type AllocRow = { assign_type: string; assign_value: string; percentage: number; is_operational: boolean };
type DistribRow = { assign_value: string; cost_center_id: string; percentage: number; cost_centers: { name: string } | null };

const TX_SELECT = "id,gl_code,category_2,category_3,category_7,source,check_description,check_description_2,check_description_3,vendor,loan_number,loan_number_incomplete,operational_pct";
const NORM = (v: string) => v.trim().replace(/\s+/g, " ");

type Ctx = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Ctx) {
  const supabase = createServerClient();
  const { id } = await params;
  const sp = new URL(req.url).searchParams;
  const years = sp.getAll("year").map(Number).filter(n => !isNaN(n));
  const months = sp.getAll("month");

  // ── 0. Load global active branch filter ──────────────────────────────────────
  const { data: settingsRow } = await supabase
    .from("app_settings")
    .select("active_branches")
    .eq("id", "global")
    .maybeSingle();
  const activeBranches: string[] = Array.isArray(settingsRow?.active_branches)
    ? settingsRow.active_branches
    : [];

  // ── 1. Splits FOR this CC (vendor + description3) ─────────────────────────────
  const { data: myAllocRaw, error: e1 } = await supabase
    .from("cc_allocation_splits")
    .select("assign_type,assign_value,percentage,is_operational")
    .eq("cost_center_id", id)
    .in("assign_type", ["vendor", "description3"]);
  if (e1) return NextResponse.json({ error: e1.message }, { status: 500 });

  const myAllocs = (myAllocRaw ?? []) as AllocRow[];
  const myAllocByKey = new Map<string, { pct: number; is_op: boolean }>();
  const vendorKeys: string[] = [];
  const desc3Keys: string[] = [];
  for (const a of myAllocs) {
    myAllocByKey.set(`${a.assign_type}:${a.assign_value}`, { pct: a.percentage, is_op: a.is_operational ?? true });
    if (a.assign_type === "vendor") vendorKeys.push(a.assign_value);
    else desc3Keys.push(a.assign_value);
  }

  // ── 2. All splits for those keys (all CCs) — for distribution display ─────────
  const distribMap = new Map<string, { cc_id: string; cc_name: string; pct: number }[]>();
  const addDistrib = (rows: DistribRow[], assign_type: string) => {
    for (const s of rows) {
      const key = `${assign_type}:${s.assign_value}`;
      const arr = distribMap.get(key) ?? [];
      arr.push({ cc_id: s.cost_center_id, cc_name: (s.cost_centers as { name: string } | null)?.name ?? "Unknown", pct: s.percentage });
      distribMap.set(key, arr);
    }
  };

  if (vendorKeys.length > 0) {
    const { data } = await supabase.from("cc_allocation_splits").select("assign_value,cost_center_id,percentage,cost_centers(name)").eq("assign_type", "vendor").in("assign_value", vendorKeys);
    addDistrib((data ?? []) as unknown as DistribRow[], "vendor");
  }
  if (desc3Keys.length > 0) {
    const { data } = await supabase.from("cc_allocation_splits").select("assign_value,cost_center_id,percentage,cost_centers(name)").eq("assign_type", "description3").in("assign_value", desc3Keys);
    addDistrib((data ?? []) as unknown as DistribRow[], "description3");
  }

  // ── 3. Transactions for Case 1 items (by vendor or desc3, filtered by period) ──
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyPeriod = (q: any) => {
    if (years.length) q = q.in("year", years);
    if (months.length) q = q.in("month", months);
    if (activeBranches.length) q = q.in("branch", activeBranches);
    return q;
  };

  let case1Txs: TxRow[] = [];
  if (vendorKeys.length > 0 || desc3Keys.length > 0) {
    const fetches: Promise<TxRow[]>[] = [];
    if (vendorKeys.length > 0) {
      fetches.push(applyPeriod(supabase.from("pl_transactions").select(TX_SELECT).in("vendor", vendorKeys)).then((r: { data: unknown[] | null }) => (r.data ?? []) as TxRow[]));
    }
    if (desc3Keys.length > 0) {
      fetches.push(applyPeriod(supabase.from("pl_transactions").select(TX_SELECT).in("check_description_3", desc3Keys)).then((r: { data: unknown[] | null }) => (r.data ?? []) as TxRow[]));
    }
    const results = await Promise.all(fetches);
    const seen = new Set<string>();
    for (const batch of results) {
      for (const tx of batch) { if (!seen.has(tx.id)) { seen.add(tx.id); case1Txs.push(tx); } }
    }
  }

  // ── 4. Transactions directly assigned to this CC (Case 2 candidates) ──────────
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: case2Raw, error: e4 } = await (applyPeriod(supabase.from("pl_transactions").select(TX_SELECT).eq("cost_center_id", id)) as any);
  if (e4) return NextResponse.json({ error: e4.message }, { status: 500 });

  const vendorKeySet = new Set(vendorKeys);
  const desc3KeySet = new Set(desc3Keys);
  const case2Txs: TxRow[] = ((case2Raw ?? []) as TxRow[]).filter(tx => {
    if (tx.vendor && vendorKeySet.has(NORM(tx.vendor))) return false;
    if (tx.check_description_3 && desc3KeySet.has(tx.check_description_3)) return false;
    return true;
  });

  // ── 5. Manual patterns for this CC ───────────────────────────────────────────
  const { data: mpRaw } = await supabase.from("cc_description_patterns").select("id,pattern,gl_code").eq("cost_center_id", id).order("created_at");
  const manualPatterns: ManualPattern[] = (mpRaw ?? []).map(p => ({ id: p.id as string, pattern: p.pattern as string, gl_code: p.gl_code as string | null }));

  // ── 6. Build Case 1 split items (one per unique employee/vendor in period) ─────
  type SplitItemBuilt = SplitItemData & { category_2: string | null; category_3: string | null; is_op: boolean };
  const case1ItemsMap = new Map<string, SplitItemBuilt>();

  for (const tx of case1Txs) {
    if (tx.source === "offshore_allocations" && tx.check_description_2 === "Roster Offshore" && tx.check_description_3) {
      const key = `description3:${tx.check_description_3}`;
      if (myAllocByKey.has(key) && !case1ItemsMap.has(key)) {
        const myA = myAllocByKey.get(key)!;
        const distrib = distribMap.get(key) ?? [];
        case1ItemsMap.set(key, {
          name: tx.check_description_3, item_type: "roster_offshore",
          pct_this_cc: myA.pct, is_op: myA.is_op,
          other_ccs: distrib.filter(d => d.cc_id !== id).map(d => ({ cc_name: d.cc_name, pct: d.pct })),
          category_2: tx.category_2, category_3: tx.category_3,
        });
      }
    } else if (tx.vendor) {
      const normV = NORM(tx.vendor);
      const key = `vendor:${normV}`;
      if (myAllocByKey.has(key) && !case1ItemsMap.has(key)) {
        const myA = myAllocByKey.get(key)!;
        const distrib = distribMap.get(key) ?? [];
        case1ItemsMap.set(key, {
          name: normV, item_type: "vendor",
          pct_this_cc: myA.pct, is_op: myA.is_op,
          other_ccs: distrib.filter(d => d.cc_id !== id).map(d => ({ cc_name: d.cc_name, pct: d.pct })),
          category_2: tx.category_2, category_3: tx.category_3,
        });
      }
    }
  }
  const case1Items = [...case1ItemsMap.values()];

  // ── 7. Collect all (is_op, category_2) combos ────────────────────────────────
  const comboKey = (is_op: boolean, cat2: string | null) => `${is_op}|${cat2 ?? ""}`;
  const comboMap = new Map<string, { is_op: boolean; category_2: string | null }>();

  for (const item of case1Items) comboMap.set(comboKey(item.is_op, item.category_2), { is_op: item.is_op, category_2: item.category_2 });
  for (const tx of case2Txs) {
    const is_op = (tx.operational_pct ?? 0) > 0;
    comboMap.set(comboKey(is_op, tx.category_2), { is_op, category_2: tx.category_2 });
  }

  // ── 8. Build final structure ──────────────────────────────────────────────────
  const opGroups: CategoryGroup[] = [];
  const nonOpGroups: CategoryGroup[] = [];

  const sortedCombos = [...comboMap.values()].sort((a, b) => (a.category_2 ?? "").localeCompare(b.category_2 ?? ""));

  for (const combo of sortedCombos) {
    const ck = comboKey(combo.is_op, combo.category_2);
    const sub_sections: CategorySubSection[] = [];

    // Case 1: split items in this combo
    const myItems = case1Items.filter(it => comboKey(it.is_op, it.category_2) === ck);
    if (myItems.length > 0) {
      const cat3Map = new Map<string, SplitItemData[]>();
      for (const item of myItems) {
        const k = item.category_3 ?? "";
        const arr = cat3Map.get(k) ?? [];
        arr.push({ name: item.name, item_type: item.item_type, pct_this_cc: item.pct_this_cc, other_ccs: item.other_ccs });
        cat3Map.set(k, arr);
      }
      sub_sections.push({
        mode: "split_items",
        category_3_groups: [...cat3Map.entries()].map(([k, items]) => ({
          category_3: k || null,
          items: items.sort((a, b) => b.pct_this_cc - a.pct_this_cc),
        })),
      });
    }

    // Case 2: pattern transactions in this combo
    const myTxs = case2Txs.filter(tx => {
      const is_op = (tx.operational_pct ?? 0) > 0;
      return comboKey(is_op, tx.category_2) === ck;
    });

    const dmTxs = myTxs.filter(tx => tx.gl_code === "41309");
    const patternTxs = myTxs.filter(tx => tx.gl_code !== "41309");

    if (dmTxs.length > 0) {
      const uniqueLoans = new Set<string>();
      for (const tx of dmTxs) {
        if (tx.loan_number && !tx.loan_number_incomplete) uniqueLoans.add(tx.loan_number);
      }
      sub_sections.push({ mode: "dm_margin", loan_count: uniqueLoans.size, gl_code: "41309", gl_name: dmTxs[0]?.category_7 ?? null });
    }

    if (patternTxs.length > 0) {
      // Group by gl_code so each GL gets its own header
      type GLGroup = { txs: TxRow[]; gl_name: string | null };
      const glGroupMap = new Map<string, GLGroup>();
      for (const tx of patternTxs) {
        const gl = tx.gl_code ?? "—";
        if (!glGroupMap.has(gl)) glGroupMap.set(gl, { txs: [], gl_name: tx.category_7 ?? null });
        glGroupMap.get(gl)!.txs.push(tx);
      }

      const gl_groups: GLPatternGroup[] = [];
      for (const [gl_code, { txs: glTxs, gl_name }] of glGroupMap) {
        const relevantManual = manualPatterns.filter(mp => !mp.gl_code || mp.gl_code === gl_code);

        const manualHits = new Map<string, number>();
        const matched = new Set<string>();
        for (const tx of glTxs) {
          const desc = (tx.check_description ?? "").trim().toLowerCase();
          for (const mp of relevantManual) {
            if (desc.includes(mp.pattern.toLowerCase())) {
              manualHits.set(mp.id, (manualHits.get(mp.id) ?? 0) + 1);
              matched.add(tx.id);
            }
          }
        }

        const autoMap = new Map<string, number>();
        for (const tx of glTxs) {
          if (matched.has(tx.id)) continue;
          const desc = (tx.check_description ?? "").trim();
          if (!desc) continue;
          const pat = extractPattern(desc);
          autoMap.set(pat, (autoMap.get(pat) ?? 0) + 1);
        }

        const patterns: PatternData[] = [
          ...[...manualHits.entries()].map(([pid, count]) => {
            const mp = manualPatterns.find(p => p.id === pid)!;
            return { pattern: mp.pattern, count, is_manual: true, pattern_id: pid };
          }),
          ...[...autoMap.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([pattern, count]) => ({ pattern, count, is_manual: false, pattern_id: null })),
        ];

        gl_groups.push({ gl_code, gl_name, patterns, total_count: glTxs.length });
      }

      gl_groups.sort((a, b) => a.gl_code.localeCompare(b.gl_code));
      sub_sections.push({ mode: "patterns", gl_groups });
    }

    if (sub_sections.length === 0) continue;
    const group: CategoryGroup = { category_2: combo.category_2, sub_sections };
    if (combo.is_op) opGroups.push(group);
    else nonOpGroups.push(group);
  }

  const sections: SummarySection[] = [
    { is_operational: true,  groups: opGroups },
    { is_operational: false, groups: nonOpGroups },
  ].filter(s => s.groups.length > 0);

  return NextResponse.json({ sections, manual_patterns: manualPatterns } satisfies SummaryResponse);
}
