import type { PLReportTx, PLReportTxCC } from "@/types";

export type SplitEntry = {
  assign_type: "vendor" | "description3" | "transaction";
  assign_value: string;
  cost_center_id: string;
  percentage: number;
  is_operational?: boolean;
  cost_centers?: { name: string } | null;
};

/** Build a fast lookup Map from a flat list of split records. */
export function buildSplitsMap(splits: SplitEntry[]): Map<string, SplitEntry[]> {
  const map = new Map<string, SplitEntry[]>();
  for (const s of splits) {
    // Normalise vendor names (trim + collapse whitespace) for robust matching
    const value =
      s.assign_type === "vendor"
        ? s.assign_value.trim().replace(/\s+/g, " ")
        : s.assign_value;
    const key = `${s.assign_type}:${value}`;
    const arr = map.get(key) ?? [];
    arr.push({ ...s, assign_value: value });
    map.set(key, arr);
  }
  return map;
}

/**
 * Fan out each transaction according to its allocation split.
 * - If vendor has a split → one virtual tx per split row (movement × pct/100).
 * - Else if check_description_3 has a split → same.
 * - Otherwise → tx passes through unchanged.
 * Grand total of movements is preserved because all pcts sum to 100%.
 */
export function fanOutBySplits(
  txs: PLReportTx[],
  splitsMap: Map<string, SplitEntry[]>,
): PLReportTxCC[] {
  const result: PLReportTxCC[] = [];

  for (const tx of txs) {
    const normVendor = tx.vendor?.trim().replace(/\s+/g, " ");
    const vendorSplits  = normVendor ? splitsMap.get(`vendor:${normVendor}`) : undefined;
    const cd3Splits     = tx.check_description_3 ? splitsMap.get(`description3:${tx.check_description_3}`) : undefined;
    const txIdSplits    = splitsMap.get(`transaction:${tx.id}`);
    const activeSplits  = vendorSplits ?? cd3Splits ?? txIdSplits ?? null;

    if (activeSplits && activeSplits.length > 0) {
      for (const s of activeSplits) {
        const pct = s.percentage / 100;
        result.push({
          ...tx,
          movement: (tx.movement ?? 0) * pct,
          debit:    (tx.debit   ?? 0) * pct,
          credit:   (tx.credit  ?? 0) * pct,
          cost_center_id:     s.cost_center_id,
          cost_center_status: "assigned",
          cost_centers:       s.cost_centers ?? null,
          operational_pct:    (s.is_operational ?? true) ? 100 : 0,
        } as PLReportTxCC);
      }
    } else {
      result.push(tx as PLReportTxCC);
    }
  }

  return result;
}
