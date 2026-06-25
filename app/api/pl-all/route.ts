import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { PLReportTx } from "@/types";

export const dynamic = "force-dynamic";

const SELECT =
  "id,month,branch,check_description,vendor,ref_numb,debit,credit,movement," +
  "gl_code,gl_name,category_2,category_7,order_1,order_2";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year   = searchParams.get("year");
  const branch = searchParams.get("branch");
  const source = searchParams.get("source"); // 'original' | 'addback' | null = all

  const supabase = createServerClient();
  const all: PLReportTx[] = [];
  let offset = 0;

  while (true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let q: any = supabase.from("pl_transactions").select(SELECT).range(offset, offset + 999);
    if (year)   q = q.eq("year", parseInt(year, 10));
    if (branch) q = q.eq("branch", branch);
    if (source) q = q.eq("source", source);

    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    if (!data || data.length === 0) break;
    all.push(...(data as PLReportTx[]));
    if (data.length < 1000) break;
    offset += 1000;
  }

  return NextResponse.json(all);
}
