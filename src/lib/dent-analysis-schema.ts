import { z } from "zod";

export const dentAnalysisSchema = z.object({
  vehicleDetected: z
    .boolean()
    .describe("Whether a bus (or similar large vehicle) is clearly visible in the image"),
  overallCondition: z
    .enum(["excellent", "good", "fair", "poor"])
    .describe("Overall exterior condition of the vehicle"),
  dents: z
    .array(
      z.object({
        location: z
          .string()
          .describe('Where on the bus the dent is, e.g. "rear left panel", "front bumper"'),
        severity: z.enum(["minor", "moderate", "severe"]),
        approximateSize: z
          .string()
          .describe('Rough estimated size, e.g. "5-10cm diameter"'),
        description: z.string().describe("Short description of the dent"),
        timestamp: z
          .string()
          .nullable()
          .describe(
            'For video input only: the mm:ss timestamp where this dent is best visible. Null for photo input.',
          ),
      }),
    )
    .describe("Every distinct dent visible in the image"),
  otherDamage: z
    .array(z.string())
    .describe("Non-dent damage noticed, e.g. scratches, paint chips, cracked lights"),
  recommendation: z
    .string()
    .describe("Recommended next step, e.g. cosmetic only, bodyshop visit, urgent repair"),
  estimatedRepairCostUsd: z
    .object({ low: z.number(), high: z.number() })
    .nullable()
    .describe("Rough ballpark repair cost range in USD, or null if it cannot be estimated"),
});

export type DentAnalysis = z.infer<typeof dentAnalysisSchema>;
