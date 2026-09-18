import { AlertTriangle, CheckCircle2, Film, Wrench } from "lucide-react";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";
import { ConditionBadge, SeverityChip } from "@/components/Badges";
import {
  SEVERITY_ORDER,
  formatAed,
  isSeverity,
  totalCostAed,
} from "@/lib/damage-tokens";

/** Worst damage first — that is the order an inspector acts in. */
function bySeverityDesc(a: { severity: string }, b: { severity: string }) {
  const rank = (s: string) => (isSeverity(s) ? SEVERITY_ORDER.indexOf(s) : -1);
  return rank(b.severity) - rank(a.severity);
}

export function AnalysisDetails({ result }: { result: DentAnalysis }) {
  const dents = [...result.dents].sort(bySeverityDesc);

  return (
    <div className="flex flex-col gap-5 border-t border-slate-200 pt-4 dark:border-white/10">
      {!result.vehicleDetected && (
        <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            No bus was clearly detected in this file — results below may be
            unreliable.
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
          Overall condition
        </span>
        <ConditionBadge condition={result.overallCondition} />
      </div>

      <div>
        <h3 className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
          Dents found ({dents.length})
        </h3>
        {dents.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
            <CheckCircle2 className="size-4 shrink-0" />
            <p>No dents detected.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {dents.map((dent, i) => (
              <li
                key={i}
                className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium text-slate-800 dark:text-slate-100">
                    {dent.location}
                  </span>
                  <SeverityChip severity={dent.severity} />
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {dent.description}
                </p>
                <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400 dark:text-slate-500">
                  <span>Approx. size: {dent.approximateSize}</span>
                  {dent.repairMethod && <span>{dent.repairMethod}</span>}
                  {dent.estimatedCostAed && (
                    <span className="font-medium text-slate-600 dark:text-slate-300">
                      AED {formatAed(dent.estimatedCostAed.low)}–
                      {formatAed(dent.estimatedCostAed.high)}
                    </span>
                  )}
                  {dent.timestamp && (
                    <span className="flex items-center gap-1">
                      <Film className="size-3" />
                      {dent.timestamp}
                    </span>
                  )}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>

      {result.otherDamage.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
            Other damage
          </h3>
          <ul className="flex flex-col gap-1.5">
            {result.otherDamage.map((d, i) => (
              <li
                key={i}
                className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
              >
                <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
                {d}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-col gap-2 rounded-xl bg-slate-50 p-4 dark:bg-white/5">
        <h3 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          <Wrench className="size-3.5" />
          Recommendation
        </h3>
        <p className="text-sm text-slate-700 dark:text-slate-300">
          {result.recommendation}
        </p>
        {(() => {
          const total = totalCostAed(result);
          if (!total) return null;
          return (
            <p className="mt-1 text-sm font-medium text-slate-900 dark:text-white">
              Estimated repair cost: AED {formatAed(total.low)} – AED{" "}
              {formatAed(total.high)}
              <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                {total.basis === "itemised"
                  ? total.costed < total.items
                    ? `(sum of ${total.costed} of ${total.items} items — ${total.items - total.costed} unpriced)`
                    : `(sum of ${total.costed} item${total.costed === 1 ? "" : "s"})`
                  : total.basis === "converted"
                    ? "(converted from an earlier USD estimate)"
                    : "(overall estimate)"}
              </span>
            </p>
          );
        })()}
      </div>
    </div>
  );
}
