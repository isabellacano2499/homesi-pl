import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { transaction_ids } = await req.json() as { transaction_ids: string[] };

  if (!transaction_ids?.length) {
    return NextResponse.json({ error: "transaction_ids is required" }, { status: 400 });
  }

  const supabase = createServerClient();

  const { error } = await supabase
    .from("pl_transactions")
    .update({
      cost_center_id: null,
      cost_center_status: "unassigned",
      cost_center_conflicts: null,
      assignment_origin: null,
    })
    .in("id", transaction_ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ unassigned: transaction_ids.length });
}
