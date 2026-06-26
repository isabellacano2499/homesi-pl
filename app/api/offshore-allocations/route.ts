import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

const SELECT =
  "id,month,year,branch,gl_code,gl_name," +
  "check_description,check_description_2,check_description_3," +
  "vendor,category,position,branch_allocation," +
  "debit,credit,movement," +
  "cost_center_id,cost_center_status,cost_centers(name)";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const years  = searchParams.getAll("year");
  const months = searchParams.getAll("month");

  const supabase = createServerClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const all: any[] = [];
  let offset = 0;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase
      .from("pl_transactions")
      .select(SELECT)
      .eq("source", "offshore_allocations")
      .range(offset, offset + 999);
    if (years.length  > 0) q = q.in("year",  years.map((y) => parseInt(y, 10)));
    if (months.length > 0) q = q.in("month", months);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < 1000) break;
    offset += 1000;
  }

  return NextResponse.json(all);
}
