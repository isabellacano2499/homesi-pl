import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase-server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createServerClient();

  const { data: uploads, error } = await supabase
    .from("pl_uploads")
    .select("*")
    .order("uploaded_at", { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!uploads || uploads.length === 0) return NextResponse.json([]);

  // Determine source type per upload from pl_transactions (one query for all uploads)
  const uploadIds = uploads.map((u: { id: string }) => u.id);

  const { data: sourceSamples } = await supabase
    .from("pl_transactions")
    .select("upload_id,source")
    .in("upload_id", uploadIds)
    .not("source", "is", null)
    .limit(uploadIds.length * 3);

  const sourceByUpload: Record<string, string> = {};
  for (const s of (sourceSamples ?? []) as { upload_id: string; source: string }[]) {
    if (!sourceByUpload[s.upload_id]) sourceByUpload[s.upload_id] = s.source;
  }

  const result = uploads.map((u: Record<string, unknown>) => ({
    ...u,
    source_type: sourceByUpload[u.id as string] ?? null,
  }));

  return NextResponse.json(result);
}
