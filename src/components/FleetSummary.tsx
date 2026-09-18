"use client";

import { useState } from "react";
import { Bus, Coins, ShieldAlert, Wrench } from "lucide-react";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";
import {
  SEVERITY_ICON,
  SEVERITY_ORDER,
  SEVERITY_RAMP,
  compactAed,
  totalCostAed,
  isSeverity,
  type Severity,
} from "@/lib/damage-tokens";

/** A headline number. No delta/trend: we have no prior period to compare against. */
function StatTile({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-slate-200/70 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
      <span className="flex items-center gap-1.5 text-xs font-medium text-slate-500 dark:text-slate-400">
        <Icon className="size-3.5" />
        {label}
      </span>
      <span className="text-2xl font-semibold text-slate-900 dark:text-white">
        {value}
      </span>
      {hint && (
        <span className="text-xs text-slate-400 dark:text-slate-500">{hint}</span>
      )}
    </div>
  );
}

export default function FleetSummary({
  analyses,
}: {
  analyses: DentAnalysis[];
}) {
  const [hovered, setHovered] = useState<Severity | null>(null);

  if (analyses.length === 0) return null;

  const counts: Record<Severity, number> = {
    minor: 0,
    moderate: 0,
    severe: 0,
  };
  let totalDents = 0;
  let costLow = 0;
  let costHigh = 0;
  let costed = 0;

  for (const a of analyses) {
    totalDents += a.dents.length;
    for (const d of a.dents) {
      if (isSeverity(d.severity)) counts[d.severity] += 1;
    }
    const total = totalCostAed(a);
    if (total) {
      costLow += total.low;
      costHigh += total.high;
      costed += 1;
    }
  }

  const attention = counts.moderate + counts.severe;
  const present = SEVERITY_ORDER.filter((s) => counts[s] > 0);

  return (
    <section className="flex flex-col gap-5 rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-xs sm:p-6 dark:border-white/10 dark:bg-white/5">
      <h2 className="text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
        This inspection batch
      </h2>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label="Vehicles inspected"
          value={analyses.length.toLocaleString()}
          icon={Bus}
        />
        <StatTile
          label="Dents found"
          value={totalDents.toLocaleString()}
          icon={Wrench}
        />
        <StatTile
          label="Needing attention"
          value={attention.toLocaleString()}
          hint="Moderate or severe"
          icon={ShieldAlert}
        />
        <StatTile
          label="Est. repair exposure"
          value={costed === 0 ? "—" : `${compactAed(costLow)}–${compactAed(costHigh)}`}
          hint={
            costed === 0
              ? "No estimate available"
              : `Across ${costed} of ${analyses.length} vehicle${analyses.length === 1 ? "" : "s"}`
          }
          icon={Coins}
        />
      </div>

      {totalDents > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
              Severity mix
            </span>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              {hovered
                ? `${hovered} · ${counts[hovered]} of ${totalDents} (${Math.round((counts[hovered] / totalDents) * 100)}%)`
                : `${totalDents} dent${totalDents === 1 ? "" : "s"} total`}
            </span>
          </div>

          {/* Stacked bar: 2px surface gaps do the separating, rounded outer ends only. */}
          <div
            className="flex h-5 w-full gap-[2px] overflow-hidden rounded-[4px]"
            onMouseLeave={() => setHovered(null)}
          >
            {present.map((s) => (
              <div
                key={s}
                role="presentation"
                onMouseEnter={() => setHovered(s)}
                style={{
                  backgroundColor: SEVERITY_RAMP[s],
                  flexBasis: `${(counts[s] / totalDents) * 100}%`,
                  opacity: hovered && hovered !== s ? 0.45 : 1,
                }}
                className="h-full min-w-[3px] shrink-0 transition-opacity first:rounded-l-[4px] last:rounded-r-[4px]"
              />
            ))}
          </div>

          {/* Legend is always present: identity never rests on colour alone. */}
          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {SEVERITY_ORDER.map((s) => {
              const Icon = SEVERITY_ICON[s];
              return (
                <li
                  key={s}
                  onMouseEnter={() => setHovered(s)}
                  onMouseLeave={() => setHovered(null)}
                  className="flex items-center gap-1.5 text-xs text-slate-600 dark:text-slate-300"
                >
                  <span
                    aria-hidden
                    className="size-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEVERITY_RAMP[s] }}
                  />
                  <Icon className="size-3.5 text-slate-400 dark:text-slate-500" />
                  <span className="capitalize">{s}</span>
                  <span className="font-semibold text-slate-900 tabular-nums dark:text-white">
                    {counts[s]}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
