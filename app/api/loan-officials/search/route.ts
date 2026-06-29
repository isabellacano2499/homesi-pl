import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export type LoanOfficialSearchResult = {
  loan_number: string;
  borrower_name: string | null;
  loan_officer: string | null;
  month: string | null;
  year: number | null;
};

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") ?? "").trim();
  const prefix = (searchParams.get("prefix") ?? "").trim();
  const limit = Math.min(Number(searchParams.get("limit") ?? "15"), 50);

  if (!q && !prefix) {
    return NextResponse.json([]);
  }

  const supabase = createServerClient();

  let query = supabase
    .from("loan_officials")
    .select("loan_number,borrower_name,loan_officer,month,year")
    .limit(limit);

  if (prefix) {
    // Prefix match: used for ambiguous candidates
    query = query.ilike("loan_number", `${prefix}%`);
  } else if (/^\d+$/.test(q)) {
    // Numeric query → search by loan_number prefix
    query = query.ilike("loan_number", `${q}%`);
  } else {
    // Text query → search by borrower name
    query = query.ilike("borrower_name", `%${q}%`);
  }

  const { data, error } = await query.order("loan_number");
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json((data ?? []) as LoanOfficialSearchResult[]);
}
