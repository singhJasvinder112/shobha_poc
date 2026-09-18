"use client";

import type { DentAnalysis } from "@/lib/dent-analysis-schema";
import { DAMAGE_MARKS } from "@/lib/handover-checklist";
import { SEVERITY_RAMP, isSeverity } from "@/lib/damage-tokens";
import { placeAll, type DiagramView } from "@/lib/damage-mapping";

/**
 * The "Vehicle Condition Diagrams" half of the handover form: four views of the
 * bus with each damage marked where it sits, using the form's own legend
 * (X = Dent, / = Scratch, O = Crack/Hole).
 */

const STROKE = "#334155";

function BusSide({ flip = false }: { flip?: boolean }) {
  return (
    <g
      fill="none"
      stroke={STROKE}
      strokeWidth={1.4}
      strokeLinejoin="round"
      transform={flip ? "translate(200,0) scale(-1,1)" : undefined}
    >
      {/* body shell, windscreen raked at the front */}
      <path d="M14 66 L14 30 Q14 22 24 20 L150 16 Q186 16 190 26 L190 66 Z" />
      {/* waist line */}
      <path d="M14 44 L190 44" strokeWidth={0.9} />
      {/* passenger windows */}
      <g strokeWidth={0.9}>
        <rect x="26" y="25" width="26" height="15" rx="2" />
        <rect x="56" y="24" width="26" height="15" rx="2" />
        <rect x="86" y="23" width="26" height="15" rx="2" />
        <rect x="116" y="22" width="26" height="15" rx="2" />
        <rect x="146" y="21" width="24" height="15" rx="2" />
      </g>
      {/* door */}
      <rect x="150" y="44" width="22" height="22" strokeWidth={0.9} />
      {/* skirt */}
      <path d="M14 62 L190 62" strokeWidth={0.7} />
      {/* wheels */}
      <circle cx="48" cy="68" r="9" />
      <circle cx="48" cy="68" r="4" strokeWidth={0.8} />
      <circle cx="158" cy="68" r="9" />
      <circle cx="158" cy="68" r="4" strokeWidth={0.8} />
      <path d="M14 66 L39 66 M57 66 L149 66 M167 66 L190 66" />
    </g>
  );
}

function BusFront({ rear = false }: { rear?: boolean }) {
  return (
    <g fill="none" stroke={STROKE} strokeWidth={1.4} strokeLinejoin="round">
      {/* cab outline */}
      <path d="M16 72 L16 24 Q16 16 26 16 L94 16 Q104 16 104 24 L104 72 Z" />
      {/* glass */}
      <rect
        x="24"
        y="22"
        width="72"
        height={rear ? 20 : 24}
        rx="3"
        strokeWidth={0.9}
      />
      {rear ? (
        <>
          {/* tail lamps */}
          <rect x="22" y="52" width="14" height="10" rx="2" strokeWidth={0.9} />
          <rect x="84" y="52" width="14" height="10" rx="2" strokeWidth={0.9} />
          {/* plate */}
          <rect x="48" y="53" width="24" height="9" rx="1" strokeWidth={0.9} />
        </>
      ) : (
        <>
          {/* grille */}
          <rect x="40" y="50" width="40" height="12" rx="2" strokeWidth={0.9} />
          <path d="M40 54 L80 54 M40 58 L80 58" strokeWidth={0.6} />
          {/* headlamps */}
          <rect x="21" y="50" width="15" height="9" rx="2" strokeWidth={0.9} />
          <rect x="84" y="50" width="15" height="9" rx="2" strokeWidth={0.9} />
          {/* mirrors */}
          <path d="M16 30 L8 34 M104 30 L112 34" strokeWidth={1} />
        </>
      )}
      {/* bumper */}
      <rect x="14" y="64" width="92" height="8" rx="2" strokeWidth={1} />
    </g>
  );
}

const VIEWS: { id: DiagramView; label: string; wide: boolean }[] = [
  { id: "front", label: "Front", wide: false },
  { id: "rear", label: "Rear", wide: false },
  { id: "left", label: "Left Side", wide: true },
  { id: "right", label: "Right Side", wide: true },
];

export default function VehicleDiagrams({ result }: { result: DentAnalysis }) {
  const { placed, unplaced } = placeAll(result.dents);

  return (
    <section className="border-t-2 border-slate-900 px-4 py-3">
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-[13px] font-bold text-slate-900">
          Vehicle Condition Diagrams
        </h4>
        <span className="text-[11px] text-slate-600">
          {DAMAGE_MARKS.dent.mark} = {DAMAGE_MARKS.dent.label} &nbsp;
          {DAMAGE_MARKS.scratch.mark} = {DAMAGE_MARKS.scratch.label} &nbsp;
          {DAMAGE_MARKS.crack.mark} = {DAMAGE_MARKS.crack.label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2">
        {VIEWS.map((view) => {
          const marks = placed.filter((p) => p.view === view.id);
          return (
            <figure
              key={view.id}
              className="relative rounded border border-slate-300 bg-white p-1"
            >
              <svg
                viewBox={view.wide ? "0 0 200 90" : "0 0 120 90"}
                className="w-full"
                role="img"
                aria-label={`${view.label} view`}
              >
                {view.id === "left" && <BusSide />}
                {view.id === "right" && <BusSide flip />}
                {view.id === "front" && <BusFront />}
                {view.id === "rear" && <BusFront rear />}
              </svg>

              {/* Markers sit in a percentage-positioned overlay so they line up
                  at any rendered size. */}
              {marks.map((m) => {
                const dent = result.dents[m.index];
                const type = dent.damageType ?? "dent";
                const color = isSeverity(dent.severity)
                  ? SEVERITY_RAMP[dent.severity]
                  : "#64748b";
                return (
                  <span
                    key={m.index}
                    title={`${m.index + 1}. ${dent.location} — ${dent.severity}`}
                    style={{
                      left: `${m.x}%`,
                      top: `${m.y}%`,
                      backgroundColor: color,
                    }}
                    className="absolute flex size-[18px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full text-[10px] font-bold text-white shadow-sm ring-2 ring-white"
                  >
                    {DAMAGE_MARKS[type]?.mark ?? "X"}
                  </span>
                );
              })}

              <figcaption className="pb-0.5 text-center text-[11px] font-semibold text-slate-700">
                {view.label}
              </figcaption>
            </figure>
          );
        })}
      </div>

      {/* Nothing is dropped silently: anything unplaceable is named here. */}
      {unplaced.length > 0 && (
        <p className="mt-2 text-[11px] text-slate-600">
          <span className="font-semibold">Not placed on a diagram:</span>{" "}
          {unplaced
            .map((i) => `${i + 1}. ${result.dents[i].location}`)
            .join("; ")}
        </p>
      )}
    </section>
  );
}
