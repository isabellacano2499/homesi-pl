import { NextRequest, NextResponse } from "next/server";
import { parseLoanCount } from "@/lib/parse-loan-count";
import { runLoanNumberCompletion } from "@/lib/loan-number-completion";
import { createServerClient } from "@/lib/supabase-server";
import type { UploadLoanCountResponse } from "@/types";

export async function POST(req: NextRequest) {
  const supabase = createServerClient();

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const { searchParams } = new URL(req.url);
    const force = searchParams.get("force") === "true";

    const buffer = Buffer.from(await file.arrayBuffer());
    const { rows, warnings } = parseLoanCount(buffer);

    if (rows.length === 0) {
      return NextResponse.json({ error: "No valid loan rows found in file" }, { status: 422 });
    }

    // Determine month/year from parsed data (use first row as representative)
    const month = rows[0].month ?? null;
    const year = rows[0].year ?? null;

    // Duplicate check: if data already exists for this month/year, warn before replacing
    if (!force && month && year) {
      const { count } = await supabase
        .from("loan_officials")
        .select("id", { count: "exact", head: true })
        .eq("month", month)
        .eq("year", year);

      if (count && count > 0) {
        return NextResponse.json(
          { duplicate: true, info: { month, year, existing_count: count } },
          { status: 409 }
        );
      }
    }

    // Replace existing data for this month/year
    if (month && year) {
      await supabase
        .from("loan_officials")
        .delete()
        .eq("month", month)
        .eq("year", year);
    }

    // Insert in chunks
    const CHUNK = 500;
    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const { error } = await supabase.from("loan_officials").insert(chunk);
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Run loan number completion across all pl_transactions
    const completion = await runLoanNumberCompletion(supabase);

    const response: UploadLoanCountResponse = {
      rowCount: rows.length,
      month,
      year,
      warnings: warnings.length,
      completion,
    };

    return NextResponse.json(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[upload-loan-count]", message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
