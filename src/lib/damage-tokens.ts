/**
 * Shared visual vocabulary for damage reporting.
 *
 * Two different colour jobs live here and they must not be mixed up:
 *
 * - SEVERITY (minor -> moderate -> severe) is an *ordered* scale, so it uses a
 *   single-hue ordinal ramp in the brand orange. Validated light->dark with
 *   monotone lightness, >=0.06 dL between steps, and the light end clearing the
 *   surface, in both light and dark mode.
 * - CONDITION (excellent -> poor) is a *status*, so it uses the reserved status
 *   palette. Status colours are fixed and never themed.
 *
 * Both always ship an icon + a text label: colour never carries meaning alone.
 */
import {
  AlertOctagon,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  type LucideIcon,
} from "lucide-react";

export type Severity = "minor" | "moderate" | "severe";
export type Condition = "excellent" | "good" | "fair" | "poor";

/** Ordinal ramp, light -> dark. Same three steps validate in both modes. */
export const SEVERITY_RAMP: Record<Severity, string> = {
  minor: "#fb9856",
  moderate: "#ef6306",
  severe: "#953e04",
};

/** Severity order, least to most serious. Drives sorting and stack order. */
export const SEVERITY_ORDER: Severity[] = ["minor", "moderate", "severe"];

export const SEVERITY_ICON: Record<Severity, LucideIcon> = {
  minor: CircleDot,
  moderate: AlertTriangle,
  severe: AlertOctagon,
};

/** Reserved status palette — fixed, never themed. */
const STATUS = {
  good: "#0ca30c",
  serious: "#ec835a",
  critical: "#d03b3b",
} as const;

export const CONDITION_COLOR: Record<Condition, string> = {
  excellent: STATUS.good,
  good: STATUS.good,
  fair: STATUS.serious,
  poor: STATUS.critical,
};

export const CONDITION_ICON: Record<Condition, LucideIcon> = {
  excellent: CheckCircle2,
  good: CheckCircle2,
  fair: AlertTriangle,
  poor: AlertOctagon,
};

/** Worst-first, so a fleet roll-up can rank buses needing attention. */
export const CONDITION_ORDER: Condition[] = ["poor", "fair", "good", "excellent"];

export function isSeverity(v: string): v is Severity {
  return v === "minor" || v === "moderate" || v === "severe";
}

export function isCondition(v: string): v is Condition {
  return v === "excellent" || v === "good" || v === "fair" || v === "poor";
}

type CostRange = { low: number; high: number } | null | undefined;

/**
 * The authoritative repair total: the sum of the per-item estimates.
 *
 * Summing here rather than trusting a model-supplied total means the line items
 * and the headline can never disagree on screen. Inspections saved before
 * per-item costing existed fall back to their single overall range.
 */
/** The dirham is pegged to the dollar at this rate, so the conversion is exact. */
const AED_PER_USD = 3.6725;

export type CostTotal = {
  low: number;
  high: number;
  /** How many damage entries carried their own price. */
  costed: number;
  /** Total damage entries. When it exceeds `costed`, the figure is partial. */
  items: number;
  /** "itemised" = summed line items, "overall" = a single model figure,
   *  "converted" = an older record priced in dollars. */
  basis: "itemised" | "overall" | "converted";
};

export function totalCostAed(result: {
  dents?: { estimatedCostAed?: CostRange }[];
  estimatedRepairCostAed?: CostRange;
  /** Inspections saved before the switch to dirhams. */
  estimatedRepairCostUsd?: CostRange;
}): CostTotal | null {
  let low = 0;
  let high = 0;
  let costed = 0;
  const items = (result.dents ?? []).length;

  for (const d of result.dents ?? []) {
    if (d?.estimatedCostAed) {
      low += d.estimatedCostAed.low;
      high += d.estimatedCostAed.high;
      costed += 1;
    }
  }

  if (costed > 0) return { low, high, costed, items, basis: "itemised" };

  const overall = result.estimatedRepairCostAed;
  if (overall)
    return { ...overall, costed: 0, items, basis: "overall" };

  // Records written before the switch to dirhams still hold a dollar range.
  // The peg is fixed, so converting is exact rather than an estimate — better
  // than showing no figure at all for an older inspection.
  const usd = result.estimatedRepairCostUsd;
  if (usd) {
    return {
      low: Math.round(usd.low * AED_PER_USD),
      high: Math.round(usd.high * AED_PER_USD),
      costed: 0,
      items,
      basis: "converted",
    };
  }

  return null;
}

const AED_FORMAT = new Intl.NumberFormat("en-AE", { maximumFractionDigits: 0 });

/** Group digits Western-style regardless of the viewer's locale. */
export function formatAed(n: number): string {
  return AED_FORMAT.format(Math.round(n));
}

/** Compact dirhams for stat tiles: AED 1,284 / AED 12.9K / AED 4.2M. */
export function compactAed(n: number): string {
  if (n >= 1_000_000) return `AED ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `AED ${(n / 1000).toFixed(1)}K`;
  return `AED ${formatAed(n)}`;
}
