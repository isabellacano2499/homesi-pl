import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

type Ctx = { params: Promise<{ id: string }> };

const BOOLEAN_FIELDS = new Set(["b2b", "processing", "support_on_demand", "affinity", "recruitment"]);
const TEXT_FIELDS = new Set(["lead_source_lo", "bd_owner"]);

export async function PATCH(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const allowed: Record<string, boolean | string | null> = {};
  for (const [k, v] of Object.entries(body)) {
    if (BOOLEAN_FIELDS.has(k) && typeof v === "boolean") {
      allowed[k] = v;
    } else if (TEXT_FIELDS.has(k) && (typeof v === "string" || v === null)) {
      allowed[k] = typeof v === "string" && v.trim() === "" ? null : v;
    }
  }

  if (Object.keys(allowed).length === 0) {
    return NextResponse.json({ error: "No valid fields provided" }, { status: 400 });
  }

  const supabase = createServerClient();
  const { data, error } = await supabase
    .from("loan_officials")
    .update({ ...allowed, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}
