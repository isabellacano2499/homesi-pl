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

  const { error } = await supabase
    .from("pl_transactions")
    .update({
      cost_center_id,
      cost_center_status: "assigned",
      cost_center_conflicts: null,
      assignment_origin: "manual",
    })
    .in("id", transaction_ids);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ assigned: transaction_ids.length });
}
