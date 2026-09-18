import { createClient } from "@supabase/supabase-js";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";

type DentAnalysisRow = {
  id: number;
  created_at: string;
  file_name: string;
  media_type: string;
  vehicle_detected: boolean;
  overall_condition: string;
  dents_count: number;
  result: DentAnalysis;
};

export type Database = {
  public: {
    Tables: {
      dent_analyses: {
        Row: DentAnalysisRow;
        Insert: Omit<DentAnalysisRow, "id" | "created_at"> &
          Partial<Pick<DentAnalysisRow, "id" | "created_at">>;
        Update: Partial<DentAnalysisRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};

let client: ReturnType<typeof createClient<Database>> | null = null;

/**
 * Whether Supabase credentials are present. Callers use this to tell a
 * *deliberately unconfigured* deployment (history simply switched off) apart
 * from a real outage, so the UI can say which one it is.
 */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
}

export function getSupabase() {
  if (!client) {
    const url = process.env.SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !key) {
      throw new Error(
        "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables",
      );
    }

    client = createClient<Database>(url, key, { auth: { persistSession: false } });
  }

  return client;
}
