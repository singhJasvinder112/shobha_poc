import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { dentAnalysisSchema } from "@/lib/dent-analysis-schema";
import { saveAnalysis, type TranscriptTurn } from "@/lib/db";
import { HANDOVER_SECTIONS } from "@/lib/handover-checklist";

export const maxDuration = 60;

const MODEL = google("gemini-3.8-flash");

const INSTRUCTIONS =
  "You just finished a live camera inspection session of a vehicle — a bus or a car: you watched its " +
  "video feed in real time and answered questions about visible damage as they " +
  "came up. Below is the transcript of that session. Consolidate everything you " +
  "observed into a single structured damage report — merge repeated or duplicate " +
  "observations of the same dent into one entry. First decide vehicleType from the " +
  "transcript — \"bus\" for a bus/coach, \"car\" for a sedan, SUV, hatchback or pickup." +
  "Price any repair estimate in UAE dirhams (AED) using Dubai bodyshop rates for THAT vehicle type — not US or European prices. " +
  "If the transcript never confirms " +
  "a vehicle was in view, set vehicleDetected to false and leave the other fields as " +
  "reasonable defaults.";


// A live walkaround and a photo upload must produce the SAME structured report,
// so either can feed one handover form.
const CAMERA_ITEMS = HANDOVER_SECTIONS.flatMap((section) =>
  section.items
    .filter((item) => item.evidence !== "manual")
    .map((item) => `  ${item.id} — ${section.title}: ${item.label}`),
).join("\n");

const LIVE_REPORT_RULES = `

Produce exactly the same structured report a photo upload would produce.

CHECKLIST — return a "checklist" array of { itemId, status, remark } using only
these ids, and only for things actually observed during the call:
${CAMERA_ITEMS}
status is "good", "attention" or "not_assessable". Omit anything the session did
not actually cover — an honest short list beats an invented complete one. Never
report on brakes, engine, battery, horn, fuel, tyre pressure or paperwork.

VEHICLE — fill "vehicle" with the plate, fleet/asset ID and make/model if they
were read out or clearly seen. Use null otherwise; never invent a plate.

DAMAGE — set damageType ("dent", "scratch" or "crack") on every entry.

COSTING — first decide vehicleType (bus or car), then price each item from the
MATCHING rate card below, set estimatedCostAed on it, and name the line in
repairMethod. Set the overall estimatedRepairCostAed to the sum.

If vehicleType is "bus" — Dubai BUS bodyshop rates in AED:
  Polish / buff out a light scratch ............. 100 - 300
  PDR (paintless dent removal), small dent ...... 150 - 400
  Small dent, repair + localised respray ........ 400 - 800
  Medium panel dent, beat + respray ............. 900 - 1,800
  Large panel dent, beat + respray .............. 1,800 - 3,500
  Panel section replacement ..................... 3,500 - 7,000
  Bumper / corner skirt repair .................. 400 - 1,000
  Bumper replacement ............................ 2,000 - 4,500
  Headlamp or tail lamp unit .................... 800 - 2,200
  Windscreen replacement ........................ 1,200 - 3,000
  Side window glass ............................. 600 - 1,500
  Mirror assembly ............................... 300 - 900
  Structural / chassis work ..................... 8,000 upwards

If vehicleType is "car" — Dubai CAR bodyshop rates in AED:
  Polish / buff out a light scratch .............. 80 - 250
  PDR (paintless dent removal), small dent ....... 120 - 350
  Small dent, repair + localised respray ......... 300 - 600
  Medium panel dent, beat + respray .............. 600 - 1,200
  Large panel dent, beat + respray ............... 1,200 - 2,500
  Panel replacement ............................... 1,500 - 4,000
  Bumper repair .................................... 300 - 800
  Bumper replacement ............................... 1,200 - 3,000
  Headlamp or tail lamp unit ....................... 500 - 1,800
  Windscreen replacement ........................... 800 - 2,200
  Side window glass ................................ 400 - 1,000
  Mirror assembly ................................... 200 - 700
  Structural / chassis work ........................ 5,000 upwards

A single small dent costs a few HUNDRED dirhams. Never price a minor dent in the
thousands.`;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  const transcript = body?.transcript as TranscriptTurn[] | undefined;

  if (!Array.isArray(transcript) || transcript.length === 0) {
    return NextResponse.json(
      { error: "No transcript to analyze" },
      { status: 400 },
    );
  }

  const conversation = transcript
    .map(
      (turn) =>
        `${turn.role === "user" ? "Inspector" : "Gemini"}: ${turn.text}`,
    )
    .join("\n");

  try {
    const { output } = await generateText({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: `${INSTRUCTIONS}${LIVE_REPORT_RULES}\n\nTranscript:\n${conversation}`,
        },
      ],
      output: Output.object({
        name: "DentAnalysis",
        description:
          "Structured dent/damage analysis consolidated from a live camera session transcript",
        schema: dentAnalysisSchema,
      }),
    });

    try {
      await saveAnalysis(
        `Live scan — ${new Date().toLocaleString()}`,
        "live",
        output,
        transcript,
      );
    } catch (dbError) {
      console.error("Failed to save live analysis to database", dbError);
    }

    return NextResponse.json(output);
  } catch (error) {
    console.error("Live session analysis failed", error);
    return NextResponse.json(
      { error: "Could not analyze the live session. Please try again." },
      { status: 502 },
    );
  }
}
