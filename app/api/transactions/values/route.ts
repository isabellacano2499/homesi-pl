import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";
import type { TransactionColumnValues } from "@/types";

const CATEGORICAL_COLS = [
  "month", "year", "gl_code", "gl_name",
  "branch", "vendor", "category_5", "category_6", "ref_numb",
] as const;

export async function GET(req: NextRequest) {
  const supabase = createServerClient();
  const uploadId = new URL(req.url).searchParams.get("uploadId");

  const results = await Promise.all(
    CATEGORICAL_COLS.map((col) => {
      let q = supabase
        .from("pl_transactions")
        .select(col)
        .not(col, "is", null)
        .limit(5000);
      if (uploadId) q = q.eq("upload_id", uploadId) as typeof q;
      return q;
    })
  );

  const values = {} as unknown as TransactionColumnValues;
  CATEGORICAL_COLS.forEach((col, i) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw = (results[i].data ?? []) as any[];
    const unique = [...new Set(raw.map((r) => String(r[col])))];
    // Sort months in calendar order, everything else alphabetically
    if (col === "month") {
      const ORDER = ["January","February","March","April","May","June",
                     "July","August","September","October","November","December"];
      unique.sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
    } else if (col === "year") {
      unique.sort((a, b) => Number(a) - Number(b));
    } else {
      unique.sort((a, b) => a.localeCompare(b));
    }
    (values as unknown as Record<string, string[]>)[col] = unique;
  });

  return NextResponse.json(values);
}
