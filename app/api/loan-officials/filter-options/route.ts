import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("loan_officials")
    .select("month,year,branch")
    .order("year")
    .order("month");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const months = [...new Set((data ?? []).map((r: { month: string | null }) => r.month).filter(Boolean))] as string[];
  const years = [...new Set((data ?? []).map((r: { year: number | null }) => r.year).filter((y) => y != null))] as number[];
  const branches = [...new Set((data ?? []).map((r: { branch: string | null }) => r.branch).filter(Boolean))].sort() as string[];

  return NextResponse.json({ months, years, branches });
}
