import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);
  const months = searchParams.getAll("month");
  const years = searchParams.getAll("year").map(Number).filter((n) => !isNaN(n));

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let q: any = supabase.from("loan_officials").select("*").order("year").order("month").order("loan_number");

  if (months.length > 0) q = q.in("month", months);
  if (years.length > 0) q = q.in("year", years);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
