import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { TransactionFilters, TransactionsResponse } from "@/types";

const PAGE_SIZE = 50;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function withFilters(query: any, f: TransactionFilters): any {
  if (f.uploadId) query = query.eq("upload_id", f.uploadId);
  if (f.months.length) query = query.in("month", f.months);
  if (f.years.length) query = query.in("year", f.years.map(Number));
  if (f.glCodes.length) query = query.in("gl_code", f.glCodes);
  if (f.glNames.length) query = query.in("gl_name", f.glNames);
  if (f.branches.length) query = query.in("branch", f.branches);
  if (f.vendors.length) query = query.in("vendor", f.vendors);
  if (f.category5s.length) query = query.in("category_5", f.category5s);
  if (f.category6s.length) query = query.in("category_6", f.category6s);
  if (f.refNums.length) query = query.in("ref_numb", f.refNums);
  if (f.description) query = query.ilike("check_description", `%${f.description}%`);
  if (f.debitMin) query = query.gte("debit", parseFloat(f.debitMin));
  if (f.debitMax) query = query.lte("debit", parseFloat(f.debitMax));
  if (f.creditMin) query = query.gte("credit", parseFloat(f.creditMin));
  if (f.creditMax) query = query.lte("credit", parseFloat(f.creditMax));
  if (f.movementMin) query = query.gte("movement", parseFloat(f.movementMin));
  if (f.movementMax) query = query.lte("movement", parseFloat(f.movementMax));

  // Cost center: OR across statuses and specific IDs
  if (f.costCenterIds.length || f.costCenterStatuses.length) {
    const parts = [
      ...f.costCenterStatuses.map((s) => `cost_center_status.eq.${s}`),
      ...f.costCenterIds.map((id) => `cost_center_id.eq.${id}`),
    ];
    query = query.or(parts.join(","));
  }

  // Source filter ('original' | 'addback')
  if (f.sources.length > 0) {
    query = query.in("source", f.sources);
  }

  return query;
}

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const { searchParams } = new URL(req.url);

  const filters: TransactionFilters = {
    uploadId: searchParams.get("uploadId") ?? "",
    months: searchParams.getAll("month"),
    years: searchParams.getAll("year"),
    glCodes: searchParams.getAll("gl_code"),
    glNames: searchParams.getAll("gl_name"),
    branches: searchParams.getAll("branch"),
    vendors: searchParams.getAll("vendor"),
    category5s: searchParams.getAll("category_5"),
    category6s: searchParams.getAll("category_6"),
    refNums: searchParams.getAll("ref_numb"),
    costCenterIds: searchParams.getAll("cost_center_id"),
    costCenterStatuses: searchParams.getAll("cc_status"),
    sources: searchParams.getAll("source"),
    description: searchParams.get("description") ?? "",
    debitMin: searchParams.get("debit_min") ?? "",
    debitMax: searchParams.get("debit_max") ?? "",
    creditMin: searchParams.get("credit_min") ?? "",
    creditMax: searchParams.get("credit_max") ?? "",
    movementMin: searchParams.get("movement_min") ?? "",
    movementMax: searchParams.get("movement_max") ?? "",
  };

  const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10));
  const rangeFrom = (page - 1) * PAGE_SIZE;
  const rangeTo = rangeFrom + PAGE_SIZE - 1;

  const [countRes, totalsRes, dataRes] = await Promise.all([
    withFilters(
      supabase.from("pl_transactions").select("id", { count: "exact", head: true }),
      filters
    ),
    withFilters(
      supabase.from("pl_transactions").select("debit,credit,movement"),
      filters
    ),
    withFilters(
      supabase
        .from("pl_transactions")
        .select(
          "id,journal_post_date,gl_code,gl_name,branch,vendor,ref_numb," +
          "check_description,debit,credit,movement," +
          "category_1,category_5,category_6,upload_id,year,month," +
          "cost_center_id,cost_center_status,cost_centers(name),source"
        )
        .order("journal_post_date", { ascending: true })
        .range(rangeFrom, rangeTo),
      filters
    ),
  ]);

  if (countRes.error)
    return NextResponse.json({ error: countRes.error.message }, { status: 500 });
  if (totalsRes.error)
    return NextResponse.json({ error: totalsRes.error.message }, { status: 500 });
  if (dataRes.error)
    return NextResponse.json({ error: dataRes.error.message }, { status: 500 });

  const totals = (totalsRes.data ?? []).reduce(
    (acc: { debit: number; credit: number; movement: number }, r: { debit: unknown; credit: unknown; movement: unknown }) => ({
      debit: acc.debit + (Number(r.debit) || 0),
      credit: acc.credit + (Number(r.credit) || 0),
      movement: acc.movement + (Number(r.movement) || 0),
    }),
    { debit: 0, credit: 0, movement: 0 }
  );

  const response: TransactionsResponse = {
    data: dataRes.data ?? [],
    count: countRes.count ?? 0,
    totals,
  };
  return NextResponse.json(response);
}
