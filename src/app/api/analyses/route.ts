import { NextResponse } from "next/server";
import { listAnalyses } from "@/lib/db";

export async function GET() {
  try {
    const analyses = await listAnalyses(20);
    return NextResponse.json(analyses);
  } catch (error) {
    console.error("Failed to list analyses", error);
    return NextResponse.json({ error: "Failed to load history" }, { status: 502 });
  }
}
