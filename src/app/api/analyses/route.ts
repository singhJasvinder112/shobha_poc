import { NextResponse } from "next/server";
import { listAnalyses } from "@/lib/db";
import { isSupabaseConfigured } from "@/lib/supabase";

export type AnalysesResponse = {
  /** False when no Supabase credentials are set — history is off, not broken. */
  configured: boolean;
  /** True when credentials exist but the read failed. */
  failed: boolean;
  analyses: Awaited<ReturnType<typeof listAnalyses>>;
};

export async function GET() {
  // History is a supporting feature: never fail the response over it, or the
  // whole page looks broken when only persistence is unavailable.
  if (!isSupabaseConfigured()) {
    return NextResponse.json({
      configured: false,
      failed: false,
      analyses: [],
    } satisfies AnalysesResponse);
  }

  try {
    return NextResponse.json({
      configured: true,
      failed: false,
      analyses: await listAnalyses(20),
    } satisfies AnalysesResponse);
  } catch (error) {
    console.error("Failed to list analyses", error);
    return NextResponse.json({
      configured: true,
      failed: true,
      analyses: [],
    } satisfies AnalysesResponse);
  }
}
