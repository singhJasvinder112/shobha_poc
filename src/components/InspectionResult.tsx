"use client";

import { useState } from "react";
import { ClipboardList, Stethoscope } from "lucide-react";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";
import { AnalysisDetails } from "@/components/AnalysisDetails";
import HandoverReport from "@/components/HandoverReport";
import InspectionPhoto from "@/components/InspectionPhoto";

/**
 * One inspection, two readings of it: the AI damage analysis and the SOBHA
 * handover form it pre-fills.
 *
 * Side by side on a wide screen — seeing the analysis and the resulting form
 * together is the whole point. Below ~1280px they become tabs rather than two
 * unreadable columns.
 */
export default function InspectionResult({
  result,
  fileName,
}: {
  result: DentAnalysis;
  fileName: string;
}) {
  const [tab, setTab] = useState<"analysis" | "handover">("analysis");

  return (
    <div className="flex flex-col gap-3">
      <InspectionPhoto src={result.thumbnail} alt={`Inspection photo — ${fileName}`} />

      {/* Tabs drive the narrow layout; both panes show at xl and above. */}
      <div className="flex gap-1 self-start rounded-full bg-slate-100 p-1 xl:hidden dark:bg-white/5">
        <button
          type="button"
          onClick={() => setTab("analysis")}
          aria-pressed={tab === "analysis"}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            tab === "analysis"
              ? "bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <Stethoscope className="size-3.5" />
          Analysis
        </button>
        <button
          type="button"
          onClick={() => setTab("handover")}
          aria-pressed={tab === "handover"}
          className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
            tab === "handover"
              ? "bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white"
              : "text-slate-500 dark:text-slate-400"
          }`}
        >
          <ClipboardList className="size-3.5" />
          Handover form
        </button>
      </div>

      <div className="grid gap-5 xl:grid-cols-2 xl:items-start">
        <div className={tab === "analysis" ? "" : "hidden xl:block"}>
          <AnalysisDetails result={result} />
        </div>

        <div
          className={`${tab === "handover" ? "" : "hidden xl:block"} border-t border-slate-200 pt-4 xl:border-t-0 xl:pt-0 dark:border-white/10`}
        >
          <HandoverReport result={result} fileName={fileName} />
        </div>
      </div>
    </div>
  );
}
