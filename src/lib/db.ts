import { getSupabase } from "@/lib/supabase";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";

export type TranscriptTurn = { role: "user" | "assistant"; text: string };

export type AnalysisRecord = {
  id: number;
  createdAt: string;
  fileName: string;
  mediaType: "image" | "video" | "live";
  vehicleDetected: boolean;
  overallCondition: string;
  dentsCount: number;
  result: DentAnalysis;
  transcript: TranscriptTurn[] | null;
};

type AnalysisRow = {
  id: number;
  created_at: string;
  file_name: string;
  media_type: "image" | "video" | "live";
  vehicle_detected: boolean;
  overall_condition: string;
  dents_count: number;
  result: DentAnalysis;
};

// The `dent_analyses` table has no dedicated transcript column, so a live
// session's transcript rides along inside the same `result` jsonb value.
type StoredResult = DentAnalysis & { transcript?: TranscriptTurn[] };

function fromRow(row: AnalysisRow): AnalysisRecord {
  const { transcript, ...result } = row.result as StoredResult;
  return {
    id: row.id,
    createdAt: row.created_at,
    fileName: row.file_name,
    mediaType: row.media_type,
    vehicleDetected: row.vehicle_detected,
    overallCondition: row.overall_condition,
    dentsCount: row.dents_count,
    result: result as DentAnalysis,
    transcript: transcript ?? null,
  };
}

export async function saveAnalysis(
  fileName: string,
  mediaType: "image" | "video" | "live",
  result: DentAnalysis,
  transcript?: TranscriptTurn[],
): Promise<AnalysisRecord> {
  const storedResult: StoredResult = transcript
    ? { ...result, transcript }
    : result;

  const { data, error } = await getSupabase()
    .from("dent_analyses")
    .insert({
      file_name: fileName,
      media_type: mediaType,
      vehicle_detected: result.vehicleDetected,
      overall_condition: result.overallCondition,
      dents_count: result.dents.length,
      result: storedResult,
    })
    .select()
    .single();

  if (error) throw error;

  return fromRow(data as AnalysisRow);
}

export async function listAnalyses(limit = 20): Promise<AnalysisRecord[]> {
  const { data, error } = await getSupabase()
    .from("dent_analyses")
    .select()
    .order("id", { ascending: false })
    .limit(limit);

  if (error) throw error;

  return (data as AnalysisRow[]).map(fromRow);
}
