/**
 * The SOBHA "Vehicle Handover / Takeover Acknowledgement (Bus)" checklist.
 *
 * This list is the source of truth, not the model. Gemini returns findings
 * keyed by `itemId`; the UI always renders every row below and fills in what
 * came back. That way the form is complete and in the client's own order even
 * when the model skips an item or invents one.
 *
 * `evidence` records what a camera can honestly settle:
 *   - "exterior"  — visible in a normal walkaround photo or video.
 *   - "interior"  — needs a shot from inside the bus.
 *   - "manual"    — cannot be judged from an image at all (brakes, insurance
 *                   paperwork, tyre pressure). These default to "not_assessable"
 *                   and are never auto-ticked: a form that claims the brakes
 *                   were checked from a photo is worse than no form.
 */

export type CheckEvidence = "exterior" | "interior" | "manual";

export type ChecklistItem = {
  id: string;
  label: string;
  evidence: CheckEvidence;
};

export type ChecklistSection = {
  id: string;
  /** Matches the numbering on the paper form. */
  number: number;
  title: string;
  items: ChecklistItem[];
};

export const HANDOVER_SECTIONS: ChecklistSection[] = [
  {
    id: "exterior",
    number: 1,
    title: "Exterior Condition",
    items: [
      { id: "mirrors", label: "Mirrors", evidence: "exterior" },
      { id: "body_paint", label: "Body/Paint", evidence: "exterior" },
      { id: "decals", label: "Decals", evidence: "exterior" },
      { id: "windscreen_glass", label: "Windscreen Glass", evidence: "exterior" },
      { id: "doors", label: "Doors", evidence: "exterior" },
      { id: "bumpers", label: "Bumpers", evidence: "exterior" },
      { id: "lamps", label: "Lamps", evidence: "exterior" },
      { id: "roof", label: "Roof", evidence: "exterior" },
      { id: "underbody", label: "Underbody", evidence: "exterior" },
      { id: "number_plate", label: "Number Plate", evidence: "exterior" },
    ],
  },
  {
    id: "interior",
    number: 2,
    title: "Interior Condition",
    items: [
      { id: "seats", label: "Seats", evidence: "interior" },
      { id: "seat_belts", label: "Seat Belts", evidence: "interior" },
      { id: "floor", label: "Floor", evidence: "interior" },
      { id: "dashboard", label: "Dashboard", evidence: "interior" },
      { id: "steering", label: "Steering", evidence: "interior" },
      { id: "ac", label: "A/C", evidence: "manual" },
      { id: "audio", label: "Audio", evidence: "manual" },
      { id: "interior_lights", label: "Lights", evidence: "interior" },
      { id: "cleanliness", label: "Cleanliness", evidence: "interior" },
    ],
  },
  {
    id: "documents",
    number: 3,
    title: "Documents & Accessories",
    items: [
      { id: "registration", label: "Registration", evidence: "manual" },
      { id: "insurance", label: "Insurance", evidence: "manual" },
      { id: "salik_tag", label: "Salik Tag", evidence: "interior" },
      { id: "trip_sheet", label: "Trip Sheet", evidence: "manual" },
      { id: "keys", label: "Keys", evidence: "manual" },
      { id: "jack_tools", label: "Jack/Tools", evidence: "manual" },
      { id: "manual_book", label: "Manual", evidence: "manual" },
    ],
  },
  {
    id: "wheels",
    number: 4,
    title: "Wheels & Tyres",
    items: [
      { id: "tyre_fl", label: "FL", evidence: "exterior" },
      { id: "tyre_fr", label: "FR", evidence: "exterior" },
      { id: "tyre_rl", label: "RL", evidence: "exterior" },
      { id: "tyre_rr", label: "RR", evidence: "exterior" },
      { id: "tyre_spare", label: "Spare", evidence: "manual" },
      { id: "rims", label: "Rims", evidence: "exterior" },
      { id: "tyre_pressure", label: "Tyre Pressure Checked", evidence: "manual" },
    ],
  },
  {
    id: "mechanical",
    number: 5,
    title: "Mechanical & Electrical",
    items: [
      { id: "engine", label: "Engine", evidence: "manual" },
      { id: "battery", label: "Battery", evidence: "manual" },
      { id: "exterior_lights", label: "Lights", evidence: "exterior" },
      { id: "horn", label: "Horn", evidence: "manual" },
      { id: "brakes", label: "Brakes", evidence: "manual" },
      { id: "wipers", label: "Wipers", evidence: "exterior" },
      { id: "fuel_level", label: "Fuel level", evidence: "manual" },
      { id: "exhaust", label: "Exhaust", evidence: "exterior" },
      { id: "warning_lights", label: "Warning Lights", evidence: "manual" },
    ],
  },
  {
    id: "safety",
    number: 6,
    title: "Safety & Other Equipment",
    items: [
      { id: "first_aid", label: "First Aid", evidence: "manual" },
      { id: "fire_extinguisher", label: "Fire Extinguisher", evidence: "interior" },
      { id: "warning_triangle", label: "Warning Triangle", evidence: "manual" },
      { id: "spare_bulbs", label: "Spare Bulbs/Fuses", evidence: "manual" },
      { id: "phone_charger", label: "Phone Charger", evidence: "manual" },
    ],
  },
];

/** Every valid item id — used to constrain what the model may return. */
export const CHECKLIST_ITEM_IDS = HANDOVER_SECTIONS.flatMap((s) =>
  s.items.map((i) => i.id),
);

/** The ids a camera can actually speak to, listed for the prompt. */
export const CAMERA_ASSESSABLE_IDS = HANDOVER_SECTIONS.flatMap((s) =>
  s.items.filter((i) => i.evidence !== "manual").map((i) => i.id),
);

export function findItem(itemId: string): ChecklistItem | undefined {
  for (const section of HANDOVER_SECTIONS) {
    const hit = section.items.find((i) => i.id === itemId);
    if (hit) return hit;
  }
  return undefined;
}

/** The damage marks the paper form uses on its condition diagrams. */
export const DAMAGE_MARKS = {
  dent: { mark: "X", label: "Dent" },
  scratch: { mark: "/", label: "Scratch" },
  crack: { mark: "O", label: "Crack/Hole" },
} as const;
