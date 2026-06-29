import { NextResponse } from "next/server";

const GONE = { error: "CC-level rules are deprecated. Manage rules at /api/split-rules." };

export async function PUT() {
  return NextResponse.json(GONE, { status: 410 });
}
export async function DELETE() {
  return NextResponse.json(GONE, { status: 410 });
}
export async function PATCH() {
  return NextResponse.json(GONE, { status: 410 });
}
