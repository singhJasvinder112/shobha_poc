import { z } from "zod";

/**
 * Every field added after the first version is `.nullable()` on purpose.
 *
 * `src/lib/db.ts` reads a stored row with `row.result as DentAnalysis` — a cast,
 * not a parse — so rows written before a field existed come back with it simply
 * missing. A required field would type-check fine and then throw at runtime the
 * moment someone opened an older inspection. Nullable + guarded access in the UI
 * keeps old records readable.
 */

/** Matches the damage legend on the paper form: X = Dent, / = Scratch, O = Crack/Hole. */
export const damageTypeSchema = z.enum(["dent", "scratch", "crack"]);

export const checkStatusSchema = z.enum(["good", "attention", "not_assessable"]);

/** Which of the two vehicle silhouettes/rate cards apply. Null on older records saved before car support existed — treat as "bus" for display. */
export const vehicleTypeSchema = z.enum(["bus", "car"]);

export const dentAnalysisSchema = z.object({
  vehicleDetected: z
    .boolean()
    .describe("Whether a bus, car or similar road vehicle is clearly visible in the image"),
  vehicleType: vehicleTypeSchema
    .nullable()
    .describe(
      "Whether the vehicle is a bus (or other large passenger/commercial vehicle) or a car (sedan, SUV, hatchback, pickup). Null if vehicleDetected is false.",
    ),
  overallCondition: z
    .enum(["excellent", "good", "fair", "poor"])
    .describe("Overall exterior condition of the vehicle"),
  vehicle: z
    .object({
      plateNumber: z
        .string()
        .nullable()
        .describe('Number plate exactly as printed, e.g. "C-14022". Null if not legible.'),
      assetId: z
        .string()
        .nullable()
        .describe('Fleet or asset ID painted on the vehicle, e.g. "BS-71". Null if not visible.'),
      makeModel: z
        .string()
        .nullable()
        .describe('Make and model if identifiable, e.g. "EICHER SKYLINE 20.15 NAC 70" or "TOYOTA CAMRY".'),
    })
    .nullable()
    .describe("Identifiers read directly off the vehicle. Never guess — use null."),
  dents: z
    .array(
      z.object({
        location: z
          .string()
          .describe('Where on the vehicle the damage is, e.g. "rear left panel", "front bumper"'),
        damageType: damageTypeSchema
          .nullable()
          .describe("dent, scratch, or crack/hole — matching the handover form legend"),
        severity: z.enum(["minor", "moderate", "severe"]),
        approximateSize: z
          .string()
          .describe('Rough estimated size, e.g. "5-10cm diameter"'),
        description: z.string().describe("Short description of the damage"),
        repairMethod: z
          .string()
          .nullable()
          .describe(
            'The rate-card line that applies, e.g. "PDR - small dent" or "Bumper repair"',
          ),
        estimatedCostAed: z
          .object({ low: z.number(), high: z.number() })
          .nullable()
          .describe(
            "Cost for THIS one item in AED, taken from the rate card. A small dent is a few hundred dirhams, not thousands.",
          ),
        timestamp: z
          .string()
          .nullable()
          .describe(
            'For video input only: the mm:ss timestamp where this damage is best visible. Null for photo input.',
          ),
      }),
    )
    .describe("Every distinct area of body damage visible"),
  checklist: z
    .array(
      z.object({
        itemId: z
          .string()
          .describe("The checklist item id from the list given in the instructions"),
        status: checkStatusSchema.describe(
          "good = serviceable; attention = a defect is visible; not_assessable = the supplied media cannot settle this",
        ),
        remark: z
          .string()
          .nullable()
          .describe("Short note, required when status is attention. Null otherwise."),
      }),
    )
    .nullable()
    .describe(
      "Handover checklist findings. Only include an item when the media genuinely shows it.",
    ),
  otherDamage: z
    .array(z.string())
    .describe("Non-dent damage noticed, e.g. scratches, paint chips, cracked lights"),
  recommendation: z
    .string()
    .describe("Recommended next step, e.g. cosmetic only, bodyshop visit, urgent repair"),
  estimatedRepairCostAed: z
    .object({ low: z.number(), high: z.number() })
    .nullable()
    .describe(
      "Rough repair cost range in UAE dirhams (AED) priced at Dubai bodyshop rates, or null if it cannot be estimated",
    ),
});

/**
 * A stored inspection: the model's output plus a small preview image.
 *
 * The thumbnail is produced in the browser and is NOT part of what Gemini
 * returns — it is attached server-side before saving, so it stays out of the
 * structured-output schema the model has to satisfy.
 */
export type HandoverMeta = {
  recordNo?: string | null;
  odometer?: string | null;
  nextPmKms?: string | null;
  driverName?: string | null;
  driverEmpId?: string | null;
  driverPhone?: string | null;
};

export type StoredAnalysis = z.infer<typeof dentAnalysisSchema> & {
  /** Downscaled JPEG data URL. Absent on older records. */
  thumbnail?: string | null;
  /** Operational fields entered by the inspector, not read from the image. */
  handover?: HandoverMeta | null;
};

export type DentAnalysis = StoredAnalysis;
export type DamageType = z.infer<typeof damageTypeSchema>;
export type CheckStatus = z.infer<typeof checkStatusSchema>;
export type VehicleType = z.infer<typeof vehicleTypeSchema>;
