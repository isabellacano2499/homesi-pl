import type { SupabaseClient } from "@supabase/supabase-js";

export interface CompletionStats {
  processed: number;
  completed_direct: number;
  completed_from_10: number;
  incomplete_no_match: number;
  incomplete_ambiguous: number;
}

/**
 * Scans all pl_transactions with a non-null loan_number_raw and resolves
 * each to a final loan_number using the loan_officials table as the master list.
 *
 * Rules:
 * - 12-digit raw → copy directly, loan_number_incomplete = false
 * - 10-digit raw with exactly 1 matching 12-digit loan in loan_officials →
 *     complete to 12 digits, loan_number_incomplete = false
 * - 10-digit raw with 0 matches → keep 10-digit, loan_number_incomplete = true
 * - 10-digit raw with 2+ matches → keep 10-digit, loan_number_incomplete = true
 */
export async function runLoanNumberCompletion(
  supabase: SupabaseClient
): Promise<CompletionStats> {
  // 1. Get all unique 12-digit loan numbers from loan_officials
  const { data: loansData, error: loansErr } = await supabase
    .from("loan_officials")
    .select("loan_number");

  if (loansErr) throw new Error(`loan_officials fetch: ${loansErr.message}`);

  const allLoanNumbers = [
    ...new Set(
      (loansData ?? [])
        .map((r: { loan_number: string }) => r.loan_number)
        .filter((n: string) => n && n.length === 12)
    ),
  ] as string[];

  // 2. Build prefix map: first-10-digits → [loan_numbers]
  const prefixMap = new Map<string, string[]>();
  for (const ln of allLoanNumbers) {
    const prefix = ln.slice(0, 10);
    const arr = prefixMap.get(prefix) ?? [];
    arr.push(ln);
    prefixMap.set(prefix, arr);
  }

  // 3. Fetch all pl_transactions with loan_number_raw (paginated)
  const txs: { id: string; loan_number_raw: string }[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await supabase
      .from("pl_transactions")
      .select("id,loan_number_raw")
      .not("loan_number_raw", "is", null)
      .range(offset, offset + 999);
    if (error) throw new Error(`pl_transactions fetch: ${error.message}`);
    if (!data || data.length === 0) break;
    txs.push(...(data as { id: string; loan_number_raw: string }[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  if (txs.length === 0) {
    return { processed: 0, completed_direct: 0, completed_from_10: 0, incomplete_no_match: 0, incomplete_ambiguous: 0 };
  }

  // 4. Compute outcome for each transaction
  type Update = { id: string; loan_number: string; loan_number_incomplete: boolean };
  const updates: Update[] = [];
  let completed_direct = 0;
  let completed_from_10 = 0;
  let incomplete_no_match = 0;
  let incomplete_ambiguous = 0;

  for (const tx of txs) {
    const raw = tx.loan_number_raw;
    if (raw.length === 12) {
      updates.push({ id: tx.id, loan_number: raw, loan_number_incomplete: false });
      completed_direct++;
    } else if (raw.length === 10) {
      const matches = prefixMap.get(raw) ?? [];
      if (matches.length === 1) {
        updates.push({ id: tx.id, loan_number: matches[0], loan_number_incomplete: false });
        completed_from_10++;
      } else if (matches.length === 0) {
        updates.push({ id: tx.id, loan_number: raw, loan_number_incomplete: true });
        incomplete_no_match++;
      } else {
        updates.push({ id: tx.id, loan_number: raw, loan_number_incomplete: true });
        incomplete_ambiguous++;
      }
    }
  }

  // 5. Batch update (upsert so we only touch what changed)
  const CHUNK = 500;
  for (let i = 0; i < updates.length; i += CHUNK) {
    const chunk = updates.slice(i, i + CHUNK);
    const { error } = await supabase.from("pl_transactions").upsert(
      chunk.map((u) => ({
        id: u.id,
        loan_number: u.loan_number,
        loan_number_incomplete: u.loan_number_incomplete,
      }))
    );
    if (error) throw new Error(`update chunk ${i}: ${error.message}`);
  }

  return {
    processed: txs.length,
    completed_direct,
    completed_from_10,
    incomplete_no_match,
    incomplete_ambiguous,
  };
}
