"use client";

import { useMemo, useRef, useState } from "react";
import { Check, CircleHelp, Printer, TriangleAlert } from "lucide-react";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";
import {
  DAMAGE_MARKS,
  HANDOVER_SECTIONS,
  type CheckEvidence,
} from "@/lib/handover-checklist";
import {
  SEVERITY_RAMP,
  formatAed,
  isSeverity,
  totalCostAed,
} from "@/lib/damage-tokens";
import VehicleDiagrams from "@/components/VehicleDiagrams";

type Status = "good" | "attention" | "not_assessable";

type Resolved = {
  status: Status;
  remark: string | null;
  /** True when the model actually spoke to this row, vs. it defaulting. */
  fromAi: boolean;
  evidence: CheckEvidence;
};

/** Operational header fields the AI cannot read off the bodywork. */
type HeaderFields = {
  odometer: string;
  nextPmKms: string;
  driverName: string;
  driverEmpId: string;
  driverPhone: string;
};

function StatusMark({ status }: { status: Status }) {
  if (status === "good") {
    return (
      <span
        title="Good"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-emerald-600/40 bg-emerald-50 text-emerald-700 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-400"
      >
        <Check className="size-3" strokeWidth={3} />
      </span>
    );
  }
  if (status === "attention") {
    return (
      <span
        title="Needs attention"
        className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-red-600/40 bg-red-50 text-red-700 dark:border-red-400/30 dark:bg-red-500/15 dark:text-red-400"
      >
        <TriangleAlert className="size-3" strokeWidth={2.5} />
      </span>
    );
  }
  return (
    <span
      title="Not assessable from the supplied media — check by hand"
      className="inline-flex size-4 shrink-0 items-center justify-center rounded-[3px] border border-slate-300 bg-slate-50 text-slate-400 dark:border-white/20 dark:bg-white/5 dark:text-slate-500"
    >
      <CircleHelp className="size-3" strokeWidth={2.5} />
    </span>
  );
}

export default function HandoverReport({
  result,
  fileName,
}: {
  result: DentAnalysis;
  fileName: string;
}) {
  // Marked at print time so the stylesheet targets THIS form. Several forms
  // can be open at once, so a shared id would print them on top of each other.
  const formRef = useRef<HTMLDivElement>(null);

  // Seeded from whatever the record already carries, so reopening a past
  // inspection shows what was entered at the time instead of empty boxes.
  const meta = result.handover ?? null;
  const [header, setHeader] = useState<HeaderFields>({
    odometer: meta?.odometer ?? "",
    nextPmKms: meta?.nextPmKms ?? "",
    driverName: meta?.driverName ?? "",
    driverEmpId: meta?.driverEmpId ?? "",
    driverPhone: meta?.driverPhone ?? "",
  });

  // Merge the model's findings onto the canonical list. The list drives the
  // render, so an item the model skipped or invented cannot distort the form.
  const resolved = useMemo(() => {
    const byId = new Map<string, { status: Status; remark: string | null }>();
    for (const entry of result.checklist ?? []) {
      if (!entry?.itemId) continue;
      byId.set(entry.itemId, {
        status: entry.status,
        remark: entry.remark ?? null,
      });
    }

    const map = new Map<string, Resolved>();
    for (const section of HANDOVER_SECTIONS) {
      for (const item of section.items) {
        const hit = byId.get(item.id);

        // Items no camera can settle are pinned to "not assessable" here, in
        // code. The prompt asks the model to leave them alone, but a prompt is
        // not a guarantee — and a handover form that ticks "Brakes: good" from
        // a photograph is worse than no form at all.
        if (item.evidence === "manual") {
          map.set(item.id, {
            status: "not_assessable",
            remark: null,
            fromAi: false,
            evidence: item.evidence,
          });
          continue;
        }

        map.set(item.id, {
          status: hit ? hit.status : "not_assessable",
          remark: hit?.remark ?? null,
          fromAi: Boolean(hit),
          evidence: item.evidence,
        });
      }
    }
    return map;
  }, [result.checklist]);

  const counts = useMemo(() => {
    let good = 0;
    let attention = 0;
    let pending = 0;
    for (const r of resolved.values()) {
      if (r.status === "good") good++;
      else if (r.status === "attention") attention++;
      else pending++;
    }
    return { good, attention, pending, total: resolved.size };
  }, [resolved]);

  // Stamped once per mount: recomputing inside render made the printed time
  // tick forward on every keystroke in the driver fields.
  const stampedAt = useMemo(() => new Date().toLocaleString("en-AE"), []);

  // Every handover sheet carries a reference. Derived from the record so the
  // same inspection always prints the same number.
  const metaRecordNo = meta?.recordNo ?? null;
  const recordNo = useMemo(() => {
    if (metaRecordNo) return metaRecordNo;
    let h = 0;
    for (const ch of fileName) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return String(h).padStart(10, "0").slice(0, 10);
  }, [metaRecordNo, fileName]);

  const plate = result.vehicle?.plateNumber ?? null;
  const assetId = result.vehicle?.assetId ?? null;
  const makeModel = result.vehicle?.makeModel ?? null;
  // Older records never set vehicleType — they were all buses, so that's the fallback.
  const vehicleLabel = result.vehicleType === "car" ? "Car" : "Bus";

  return (
    <div className="flex flex-col gap-4">
      {/* Coverage summary — states plainly how much the camera actually settled. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-xs dark:border-white/10 dark:bg-white/5">
        <span className="font-semibold tracking-wide text-slate-500 uppercase dark:text-slate-400">
          AI coverage
        </span>
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
          <StatusMark status="good" /> {counts.good} good
        </span>
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
          <StatusMark status="attention" /> {counts.attention} need attention
        </span>
        <span className="flex items-center gap-1.5 text-slate-700 dark:text-slate-200">
          <StatusMark status="not_assessable" /> {counts.pending} to check by hand
        </span>
        <button
          type="button"
          onClick={() => {
            const el = formRef.current;
            if (!el) return;
            el.classList.add("print-target");
            const clear = () => {
              el.classList.remove("print-target");
              window.removeEventListener("afterprint", clear);
            };
            window.addEventListener("afterprint", clear);
            window.print();
          }}
          className="ml-auto flex items-center gap-1.5 rounded-full border border-slate-300 px-3 py-1 font-medium text-slate-600 transition-colors hover:border-slate-400 hover:text-slate-900 print:hidden dark:border-white/20 dark:text-slate-300 dark:hover:text-white"
        >
          <Printer className="size-3.5" />
          Save as PDF
        </button>
      </div>

      {/* The form itself. White ground in both themes: it is a document. */}
      <div
        ref={formRef}
        className="overflow-hidden rounded-xl border border-slate-300 bg-white text-slate-900"
      >
        {!result.vehicleDetected && (
          <p className="border-b border-red-300 bg-red-50 px-4 py-2 text-[11px] font-semibold text-red-800">
            No vehicle was clearly identified in the supplied media. This form is
            not a valid handover record — re-shoot the vehicle before using it.
          </p>
        )}

        <div className="flex flex-col items-center gap-1 border-b-2 border-slate-900 px-5 py-4 text-center">
          <span className="flex w-full items-baseline justify-between gap-3">
            <span className="text-sm font-semibold tracking-[0.2em] text-slate-900">
              SOBHA
            </span>
            <span className="text-[11px] text-slate-600">
              Record: <span className="font-semibold">{recordNo}</span>
            </span>
          </span>
          <h3 className="text-sm font-semibold tracking-wide text-blue-800 uppercase">
            Vehicle Handover / Takeover Acknowledgement ({vehicleLabel})
          </h3>
          <p className="text-base font-bold tracking-wide text-blue-900 uppercase">
            Handover
          </p>
        </div>

        {/* Identity block — AI-read values sit in place, blanks are typed in. */}
        <dl className="grid grid-cols-1 border-b border-slate-300 sm:grid-cols-3">
          <Field label={`${vehicleLabel} Plate No`} value={plate} aiRead />
          <Field label="Asset ID" value={assetId} aiRead />
          <Field label="Date & Time" value={stampedAt} />
          <Field label="Make & Model" value={makeModel} aiRead />
          <EditableField
            label="Odometer"
            value={header.odometer}
            placeholder="e.g. 128,540 km"
            onChange={(v) => setHeader((h) => ({ ...h, odometer: v }))}
          />
          <EditableField
            label="Next PM kms"
            value={header.nextPmKms}
            placeholder="e.g. 135,000 km"
            onChange={(v) => setHeader((h) => ({ ...h, nextPmKms: v }))}
          />
          <EditableField
            label="Driver Name"
            value={header.driverName}
            placeholder="Full name"
            onChange={(v) => setHeader((h) => ({ ...h, driverName: v }))}
          />
          <EditableField
            label="Driver EMP ID"
            value={header.driverEmpId}
            placeholder="e.g. C20123"
            onChange={(v) => setHeader((h) => ({ ...h, driverEmpId: v }))}
          />
          <EditableField
            label="Phone"
            value={header.driverPhone}
            placeholder="Contact number"
            onChange={(v) => setHeader((h) => ({ ...h, driverPhone: v }))}
          />
          <Field label="Source file" value={fileName} />
        </dl>

        <p className="border-b border-slate-200 px-4 py-2 text-[11px] text-slate-600">
          <span className="font-semibold">Instructions:</span> Mark damages on
          diagram: {DAMAGE_MARKS.dent.mark} = {DAMAGE_MARKS.dent.label},{" "}
          {DAMAGE_MARKS.scratch.mark} = {DAMAGE_MARKS.scratch.label},{" "}
          {DAMAGE_MARKS.crack.mark} = {DAMAGE_MARKS.crack.label}. Check each
          item: ✓ Good. Marks on this form: ✓ good, ! needs attention, ? not
          assessable from the supplied media.
        </p>

        <div className="flex flex-col">
          {HANDOVER_SECTIONS.map((section) => {
            const remarks = section.items
              .map((i) => ({ item: i, r: resolved.get(i.id) }))
              .filter((x) => x.r?.status === "attention" && x.r?.remark);

            return (
              <section
                key={section.id}
                className="border-b border-slate-200 px-4 py-3 last:border-b-0"
              >
                <h4 className="mb-2 text-[13px] font-bold text-slate-900">
                  {section.number}. {section.title}
                </h4>
                <ul className="flex flex-wrap gap-x-5 gap-y-1.5">
                  {section.items.map((item) => {
                    const r = resolved.get(item.id);
                    if (!r) return null;
                    return (
                      <li
                        key={item.id}
                        className="flex items-center gap-1.5 text-[12px] text-slate-800"
                      >
                        <StatusMark status={r.status} />
                        <span
                          className={
                            r.status === "attention" ? "font-semibold" : ""
                          }
                        >
                          {item.label}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <div className="mt-2 border-t border-dotted border-slate-300 pt-1.5 text-[11px] text-slate-600">
                  <span className="font-semibold">Remarks:</span>{" "}
                  {remarks.length === 0 ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    remarks
                      .map((x) => `${x.item.label}: ${x.r?.remark}`)
                      .join("; ")
                  )}
                </div>
              </section>
            );
          })}
        </div>

        <VehicleDiagrams result={result} />

      {/* Damage schedule — the tabular half of "mark damages on diagram". */}
        <section className="border-t-2 border-slate-900 px-4 py-3">
          <h4 className="mb-2 text-[13px] font-bold text-slate-900">
            Vehicle Condition — Damage Schedule
          </h4>
          {result.dents.length === 0 ? (
            <p className="text-[12px] text-slate-500">
              No body damage recorded in this inspection.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] border-collapse text-[12px]">
              <thead>
                <tr className="border-b border-slate-300 text-left text-[11px] tracking-wide text-slate-500 uppercase">
                  <th className="py-1 pr-2 font-semibold">Mark</th>
                  <th className="py-1 pr-2 font-semibold">Location</th>
                  <th className="py-1 pr-2 font-semibold">Type</th>
                  <th className="py-1 pr-2 font-semibold">Severity</th>
                  <th className="py-1 pr-2 font-semibold">Size</th>
                  <th className="py-1 font-semibold">Est. cost (AED)</th>
                </tr>
              </thead>
              <tbody>
                {result.dents.map((d, i) => {
                  const type = d.damageType ?? "dent";
                  const mark = DAMAGE_MARKS[type]?.mark ?? "X";
                  const color = isSeverity(d.severity)
                    ? SEVERITY_RAMP[d.severity]
                    : "#64748b";
                  return (
                    <tr key={i} className="border-b border-slate-100">
                      <td className="py-1.5 pr-2">
                        <span
                          className="inline-flex size-5 items-center justify-center rounded-full text-[11px] font-bold text-white"
                          style={{ backgroundColor: color }}
                        >
                          {mark}
                        </span>
                      </td>
                      <td className="py-1.5 pr-2 text-slate-800">{d.location}</td>
                      <td className="py-1.5 pr-2 text-slate-600 capitalize">
                        {DAMAGE_MARKS[type]?.label ?? "Dent"}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-600 capitalize">
                        {d.severity}
                      </td>
                      <td className="py-1.5 pr-2 text-slate-600">
                        {d.approximateSize}
                      </td>
                      <td className="py-1.5 text-slate-800 tabular-nums">
                        {d.estimatedCostAed
                          ? `${formatAed(d.estimatedCostAed.low)} – ${formatAed(d.estimatedCostAed.high)}`
                          : "—"}
                      </td>
                    </tr>
                  );
                })}
                </tbody>
              </table>
            </div>
          )}

          {(() => {
            const total = totalCostAed(result);
            if (!total) return null;
            return (
              <p className="mt-3 text-[12px] font-semibold text-slate-900">
                Indicative repair total: AED {formatAed(total.low)} – AED{" "}
                {formatAed(total.high)}
                <span className="ml-1 font-normal text-slate-500">
                  {total.basis === "itemised" && total.costed < total.items
                    ? `— indicative only; ${total.items - total.costed} of ${total.items} items are unpriced, so the true figure is higher`
                    : "— indicative only, priced from a standard rate card"}
                </span>
              </p>
            );
          })()}
        </section>

        <div className="grid grid-cols-2 gap-6 border-t border-slate-300 px-4 py-5 text-[11px] text-slate-600">
          <div>
            <div className="h-8 border-b border-slate-400" />
            <span>Handed over by (signature)</span>
          </div>
          <div>
            <div className="h-8 border-b border-slate-400" />
            <span>Taken over by (signature)</span>
          </div>
        </div>

        <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
          Items marked &ldquo;check by hand&rdquo; could not be judged from the
          supplied media and remain the inspector&rsquo;s responsibility.
          AI-assisted pre-fill — not a substitute for physical inspection.
        </p>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  aiRead,
}: {
  label: string;
  value: string | null;
  aiRead?: boolean;
}) {
  return (
    <div className="border-r border-b border-slate-200 px-3 py-2 last:border-r-0">
      <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd className="flex items-center gap-1.5 text-[13px] font-semibold text-slate-900">
        {value ? (
          <>
            <span className="truncate">{value}</span>
            {aiRead && (
              <span
                title="Read from the image by AI"
                className="shrink-0 rounded-sm bg-[#ef6306]/15 px-1 text-[9px] font-bold tracking-wide text-[#a04304] uppercase"
              >
                AI
              </span>
            )}
          </>
        ) : (
          <span className="text-slate-300">—</span>
        )}
      </dd>
    </div>
  );
}

function EditableField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="border-r border-b border-slate-200 px-3 py-2 last:border-r-0">
      <dt className="text-[10px] tracking-wide text-slate-500 uppercase">
        {label}
      </dt>
      <dd>
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder ?? "—"}
          className="w-full bg-transparent text-[13px] font-semibold text-slate-900 placeholder:text-slate-300 focus:outline-none"
        />
      </dd>
    </div>
  );
}
