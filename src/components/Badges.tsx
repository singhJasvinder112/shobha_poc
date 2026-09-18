import {
  CONDITION_COLOR,
  CONDITION_ICON,
  SEVERITY_ICON,
  SEVERITY_RAMP,
  isCondition,
  isSeverity,
} from "@/lib/damage-tokens";

/**
 * Status and severity always render as colour + icon + word. The text itself
 * stays in ink tokens — the coloured mark beside it carries the identity, so
 * the chip stays legible where a low-contrast status hue would not.
 */
function Chip({
  color,
  icon: Icon,
  label,
  trailing,
}: {
  color: string;
  icon: React.ElementType;
  label: string;
  trailing?: React.ReactNode;
}) {
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium text-slate-700 dark:text-slate-200"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 16%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${color} 34%, transparent)`,
      }}
    >
      <Icon className="size-3.5 shrink-0" style={{ color }} />
      <span className="capitalize">{label}</span>
      {trailing}
    </span>
  );
}

export function SeverityChip({
  severity,
  count,
}: {
  severity: string;
  count?: number;
}) {
  if (!isSeverity(severity)) return null;
  return (
    <Chip
      color={SEVERITY_RAMP[severity]}
      icon={SEVERITY_ICON[severity]}
      label={severity}
      trailing={
        count === undefined ? undefined : (
          <span className="font-semibold tabular-nums">{count}</span>
        )
      }
    />
  );
}

export function ConditionBadge({ condition }: { condition: string }) {
  if (!isCondition(condition)) {
    return (
      <span className="inline-flex shrink-0 items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 capitalize dark:bg-white/10 dark:text-slate-300">
        {condition}
      </span>
    );
  }
  return (
    <Chip
      color={CONDITION_COLOR[condition]}
      icon={CONDITION_ICON[condition]}
      label={condition}
    />
  );
}
