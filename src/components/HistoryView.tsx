"use client";

import { useMemo, useState } from "react";
import { Bus, ChevronDown, Database, Search } from "lucide-react";
import type { AnalysisRecord } from "@/lib/db";
import InspectionResult from "@/components/InspectionResult";
import { ConditionBadge } from "@/components/Badges";
import { compactAed, totalCostAed } from "@/lib/damage-tokens";

/**
 * Full inspection history, grouped by vehicle.
 *
 * Several photos of the same bus are separate inspections but one vehicle, so
 * they are grouped under the plate or asset ID the model read off the bodywork.
 * Records with no readable identity fall back to their own group rather than
 * being lumped together, which would silently merge two different buses.
 */

type Group = {
  key: string;
  label: string;
  identified: boolean;
  records: AnalysisRecord[];
};

function groupByVehicle(records: AnalysisRecord[]): Group[] {
  const groups = new Map<string, Group>();

  for (const r of records) {
    const v = r.result?.vehicle;
    const plate = v?.plateNumber?.trim();
    const asset = v?.assetId?.trim();
    const identity = plate || asset || null;

    const key = identity ? `id:${identity.toLowerCase()}` : `rec:${r.id}`;
    const label = identity ?? r.fileName;

    const existing = groups.get(key);
    if (existing) existing.records.push(r);
    else
      groups.set(key, {
        key,
        label,
        identified: Boolean(identity),
        records: [r],
      });
  }

  // Newest activity first.
  return [...groups.values()].sort(
    (a, b) =>
      new Date(b.records[0].createdAt).getTime() -
      new Date(a.records[0].createdAt).getTime(),
  );
}

export default function HistoryView({
  history,
  configured,
  failed,
  openId = null,
}: {
  history: AnalysisRecord[];
  configured: boolean;
  failed: boolean;
  /** A record the sidebar asked to have opened on arrival. */
  openId?: number | null;
}) {
  const [query, setQuery] = useState("");
  // Seeded from the prop; the parent remounts this view with a key when the
  // sidebar targets a different record.
  const [openRecord, setOpenRecord] = useState<number | null>(openId);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? history.filter((r) => {
          const v = r.result?.vehicle;
          return (
            r.fileName.toLowerCase().includes(q) ||
            (v?.plateNumber ?? "").toLowerCase().includes(q) ||
            (v?.assetId ?? "").toLowerCase().includes(q) ||
            (v?.makeModel ?? "").toLowerCase().includes(q) ||
            r.overallCondition.toLowerCase().includes(q)
          );
        })
      : history;
    return groupByVehicle(filtered);
  }, [history, query]);

  if (!configured) {
    return (
      <section className="flex items-start gap-3 rounded-2xl border border-slate-200/80 bg-white/80 p-6 text-sm text-slate-600 dark:border-white/10 dark:bg-white/5 dark:text-slate-300">
        <Database className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <p>
          History is off — no database is connected. Inspections still run
          normally, they are just not being saved.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-xs sm:p-6 dark:border-white/10 dark:bg-white/5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-white">
          Inspection history
          <span className="ml-2 font-normal text-slate-400 dark:text-slate-500">
            {history.length} record{history.length === 1 ? "" : "s"} ·{" "}
            {groups.length} vehicle{groups.length === 1 ? "" : "s"}
          </span>
        </h2>
        <label className="relative flex items-center">
          <Search className="pointer-events-none absolute left-2.5 size-3.5 text-slate-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search plate, asset ID, file…"
            className="w-56 rounded-full border border-slate-200 bg-white py-1.5 pr-3 pl-8 text-xs text-slate-700 placeholder:text-slate-400 focus:border-[#ef6306] focus:outline-none dark:border-white/15 dark:bg-white/5 dark:text-slate-200"
          />
        </label>
      </div>

      {failed && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          Could not load history right now. Inspection itself is unaffected.
        </p>
      )}

      {groups.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500">
          {history.length === 0
            ? "Nothing yet. Completed inspections will appear here."
            : "No inspections match that search."}
        </p>
      )}

      <ul className="flex flex-col gap-4">
        {groups.map((group) => {
          const latest = group.records[0];
          return (
            <li
              key={group.key}
              className="rounded-xl border border-slate-200 dark:border-white/10"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-3 dark:border-white/10">
                <Bus className="size-4 shrink-0 text-[#ef6306]" />
                <span className="font-semibold text-slate-900 dark:text-white">
                  {group.label}
                </span>
                {group.identified ? (
                  <span className="rounded-full bg-[#ef6306]/15 px-2 py-0.5 text-[10px] font-bold tracking-wide text-[#a04304] uppercase">
                    Identified
                  </span>
                ) : (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
                    No plate read
                  </span>
                )}
                <span className="text-xs text-slate-400 dark:text-slate-500">
                  {group.records.length} inspection
                  {group.records.length === 1 ? "" : "s"}
                </span>
                <div className="ml-auto">
                  <ConditionBadge condition={latest.overallCondition} />
                </div>
              </div>

              <ul className="flex flex-col">
                {group.records.map((rec) => {
                  const isOpen = openRecord === rec.id;
                  const total = totalCostAed(rec.result);
                  return (
                    <li
                      key={rec.id}
                      className="border-b border-slate-100 last:border-b-0 dark:border-white/5"
                    >
                      <button
                        type="button"
                        onClick={() => setOpenRecord(isOpen ? null : rec.id)}
                        aria-expanded={isOpen}
                        className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm"
                      >
                        {rec.result?.thumbnail ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={rec.result.thumbnail}
                            alt=""
                            className="size-12 shrink-0 rounded-lg object-cover"
                          />
                        ) : (
                          <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-slate-100 dark:bg-white/10">
                            <Bus className="size-5 text-slate-300 dark:text-slate-600" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-700 dark:text-slate-200">
                            {rec.fileName}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {new Date(rec.createdAt).toLocaleString()} ·{" "}
                            {rec.mediaType} · {rec.dentsCount} finding
                            {rec.dentsCount === 1 ? "" : "s"}
                            {total && ` · ${compactAed(total.low)}–${compactAed(total.high)}`}
                          </p>
                        </div>
                        <ChevronDown
                          className={`size-4 shrink-0 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </button>

                      {isOpen && (
                        <div className="px-4 pb-4">
                          <InspectionResult
                            result={rec.result}
                            fileName={rec.fileName}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
