/**
 * Places a damage entry onto one of the handover form's four vehicle diagrams.
 *
 * The mapping is deliberately done in TypeScript from the model's plain-language
 * `location` string rather than asking Gemini for coordinates. Models are poor
 * at precise pixel placement and a marker drawn confidently in the wrong place
 * is worse than no marker — whereas keyword mapping is deterministic, testable,
 * and works on inspections that were saved before this feature existed.
 *
 * Anything that cannot be placed is reported as unplaced rather than guessed at,
 * so a damage entry is never silently dropped from the report.
 */

export type DiagramView = "front" | "rear" | "left" | "right";

export type PlacedDamage = {
  index: number;
  view: DiagramView;
  /** Percentages within the diagram box. */
  x: number;
  y: number;
};

const has = (s: string, ...words: string[]) => words.some((w) => s.includes(w));

/** Vertical band: roof line, waist, or skirt. */
function verticalBand(s: string): number {
  if (has(s, "roof", "upper", "top", "pillar", "window", "glass", "windscreen", "mirror"))
    return 24;
  if (has(s, "lower", "skirt", "underbody", "bumper", "apron", "sill", "wheel", "tyre", "tire", "step"))
    return 68;
  return 46;
}

/** Along the length of the bus, for the side views. */
function alongLength(s: string): number {
  if (has(s, "front", "fore", "nose", "cab")) return 24;
  if (has(s, "rear", "back", "tail")) return 76;
  if (has(s, "middle", "centre", "center", "mid")) return 50;
  return 50;
}

/** Across the width, for the front and rear views. */
function acrossWidth(s: string): number {
  const right = has(s, "right", "off side", "offside", "driver");
  const left = has(s, "left", "near side", "nearside", "kerb", "curb", "passenger");
  if (right && !left) return 70;
  if (left && !right) return 30;
  return 50;
}

function chooseView(s: string): DiagramView | null {
  const frontPart = has(s, "windscreen", "grille", "grill", "headlamp", "headlight", "bonnet", "apron", "cowl", "nose");
  const rearPart = has(s, "tailgate", "tail lamp", "taillight", "tail light", "rear window", "exhaust");
  // A bumper belongs on an elevation, and which one is decided by the words
  // around it: "front right bumper" is the front view, not the right side.
  const bumperPart = has(s, "bumper");
  const sidePart = has(s, "flank", "side panel", "door", "sill", "skirt", "wheel arch", "decal", "window", "pillar");

  const saysFront = has(s, "front", "fore", "nose", "cab");
  const saysRear = has(s, "rear", "back", "tail");
  const saysLeft = has(s, "left", "near side", "nearside", "kerb", "curb", "passenger");
  const saysRight = has(s, "right", "off side", "offside", "driver");

  // A named front/rear component wins: "front right bumper" belongs on the front.
  if (frontPart) return "front";
  if (rearPart) return "rear";
  if (bumperPart) {
    if (saysRear) return "rear";
    return "front";
  }

  // A named side component with a side wins the matching side view.
  if (sidePart) {
    if (saysLeft) return "left";
    if (saysRight) return "right";
  }

  if (saysFront && !saysLeft && !saysRight) return "front";
  if (saysRear && !saysLeft && !saysRight) return "rear";
  if (saysLeft) return "left";
  if (saysRight) return "right";
  if (saysFront) return "front";
  if (saysRear) return "rear";
  return null;
}

export function placeDamage(
  location: string,
  index: number,
): PlacedDamage | null {
  const s = (location || "").toLowerCase();
  const view = chooseView(s);
  if (!view) return null;

  const y = verticalBand(s);
  let x: number;
  if (view === "front" || view === "rear") {
    x = acrossWidth(s);
  } else {
    x = alongLength(s);
    // The right-side drawing is the left one mirrored, so "front" sits on the
    // opposite edge of that box. Without this, front and rear are swapped on
    // exactly one of the two side views.
    if (view === "right") x = 100 - x;
  }
  return { index, view, x, y };
}

export function placeAll(dents: { location: string }[]) {
  const placed: PlacedDamage[] = [];
  const unplaced: number[] = [];

  dents.forEach((d, i) => {
    const hit = placeDamage(d.location, i);
    if (hit) placed.push(hit);
    else unplaced.push(i);
  });

  // Nudge markers that land on the same spot so both stay readable.
  const seen = new Map<string, number>();
  for (const p of placed) {
    const key = `${p.view}:${Math.round(p.x / 8)}:${Math.round(p.y / 8)}`;
    const n = seen.get(key) ?? 0;
    seen.set(key, n + 1);
    if (n > 0) {
      p.x += n * 6 * (n % 2 === 0 ? 1 : -1);
      p.y += n * 3;
      p.x = Math.max(8, Math.min(92, p.x));
      p.y = Math.max(10, Math.min(90, p.y));
    }
  }

  return { placed, unplaced };
}
