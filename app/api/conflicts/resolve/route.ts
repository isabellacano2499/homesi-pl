import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { transaction_ids, cost_center_id } = await req.json() as {
    transaction_ids: string[];
    cost_center_id: string;
  };

  if (!transaction_ids?.length || !cost_center_id) {
    return NextResponse.json({ error: "transaction_ids and cost_center_id are required" }, { status: 400 });
  }

  const supabase = createServerClient();
  const now = new Date().toISOString();

  // Update transactions: assign to chosen CC
  const { error: txErr } = await supabase
    .from("pl_transactions")
    .update({
      cost_center_id,
      cost_center_status: "assigned",
      cost_center_conflicts: null,
    })
    .in("id", transaction_ids);

  if (txErr) return NextResponse.json({ error: txErr.message }, { status: 500 });

  // Upsert snapshots as resolved
  const { error: snapErr } = await supabase.from("conflict_snapshots").upsert(
    transaction_ids.map((txId) => ({
      transaction_id: txId,
      // conflicting_cc_ids will keep existing value if row already exists (upsert merge)
      // but we need to provide it for new rows — use empty array as fallback
      conflicting_cc_ids: [],
      is_resolved: true,
      resolved_cc_id: cost_center_id,
      resolved_at: now,
      updated_at: now,
    })),
    {
      onConflict: "transaction_id",
      ignoreDuplicates: false,
    }
  );

  if (snapErr) return NextResponse.json({ error: snapErr.message }, { status: 500 });

  return NextResponse.json({ resolved: transaction_ids.length });
}
