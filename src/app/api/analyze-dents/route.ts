import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { dentAnalysisSchema } from "@/lib/dent-analysis-schema";
import { saveAnalysis } from "@/lib/db";
import { HANDOVER_SECTIONS } from "@/lib/handover-checklist";

export const maxDuration = 60;

const MODEL = google("gemini-3.8-flash");

// Gemini's inline (non-Files-API) request payload is capped around 20MB;
// base64 adds ~33% overhead, so keep the raw upload well under that.
const MAX_INLINE_BYTES = 15 * 1024 * 1024;


// The checklist half of the prompt is generated from the canonical form, so the
// two can never drift apart. Items flagged "manual" are deliberately described
// as un-judgeable: a form that claims the brakes were checked from a photo is
// worse than no form at all.
const CAMERA_ITEMS = HANDOVER_SECTIONS.flatMap((section) =>
  section.items
    .filter((item) => item.evidence !== "manual")
    .map((item) => `  ${item.id} — ${section.title}: ${item.label}`),
).join("\n");

const CHECKLIST_INSTRUCTIONS = `
You are also pre-filling SOBHA's vehicle handover checklist. Return a "checklist"
array. Each entry is { itemId, status, remark }.

Use ONLY these itemIds — these are the things a camera can legitimately judge:
${CAMERA_ITEMS}

Rules, and they matter more than completeness:
- Include an item ONLY if this specific photo or video actually shows it. An
  interior item from an exterior-only shot must be omitted, not guessed.
- status "good" means visibly serviceable; "attention" means a defect is
  genuinely visible; "not_assessable" means it is in frame but you cannot tell.
- When status is "attention", remark must say what is wrong in a few words.
  Otherwise remark is null.
- NEVER report on brakes, engine, battery, horn, fuel level, tyre pressure,
  insurance, registration, keys, tools or spare parts. They are not visible in
  an image and are excluded from the list above on purpose.
- Omitting an item is correct and expected. A short honest checklist beats a
  complete invented one.

Also read the vehicle's own identifiers off the bodywork into "vehicle":
number plate, fleet/asset ID, and make/model. Use null for anything not clearly
legible — never infer a plate you cannot actually read.

For each damage entry set damageType to "dent", "scratch" or "crack" to match
the form's legend (X = Dent, / = Scratch, O = Crack/Hole).

Also set "vehicleType" to "bus" for a bus/coach and "car" for a sedan, SUV,
hatchback or pickup. Use null only if vehicleDetected is false.`;



const DAMAGE_SWEEP = `
Work through the vehicle methodically rather than reporting only what stands out.
Cover, in order: front bumper and BOTH front lower corners; the front panel and
grille; each wheel arch and the lower skirt along both sides; both side panels
full length; the rear bumper and both rear lower corners; and the roof line.

SMALL DAMAGE COUNTS AND IS THE POINT. This is a handover inspection: it is judged
on catching the minor knocks that are easy to miss, not the obvious ones. A 3-5cm
dent, a scuff, or a pushed-in corner is a real finding — record it with severity
"minor" rather than leaving it out. Only a genuinely undamaged panel should go
unreported.

Pay particular attention to the EXTREME LOWER CORNERS of the front and rear
bumpers and to the kerb-side lower panels. Those take the most frequent impacts,
the damage there is usually small and subtle, and it is the most commonly missed.
Look for interruptions in the reflected highlight along a panel, a shadow that
does not follow the body line, and any break in a straight edge or crease.`;



// Costing is anchored to a published rate card rather than left to the model's
// imagination: an invented four-figure price for a 5cm dent is the fastest way
// to lose a fleet manager's trust. The model picks a line and applies it; the
// TOTAL is summed in TypeScript so the figures always reconcile.
//
// Buses and cars get separate cards: a bus panel is bigger and costs more to
// beat and respray than the equivalent car panel, so one shared card would
// either overprice every car repair or underprice every bus repair.
const RATE_CARD = `
COSTING — first decide vehicleType (bus or car), then use ONLY the matching
rate card below. Do not invent prices and do not mix the two cards.

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
  Body labour ................................... 120 - 180 per hour

If vehicleType is "car" — Dubai CAR bodyshop rates in AED (sedan/SUV/hatchback/pickup):
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
  Body labour ....................................... 100 - 150 per hour

Rules:
- Set estimatedCostAed on EACH damage entry from the line that fits, and name
  that line in repairMethod.
- SCALE MATTERS. A single small dent costs a few HUNDRED dirhams. Never price a
  minor dent in the thousands. Severity "minor" should almost always land in the
  100 - 800 band.
- Only reach the structural band when panels are torn, pillars are bent or the
  chassis is involved — not for cosmetic damage.
- Also set the overall estimatedRepairCostAed to the sum of the individual
  items, so the parts and the total agree.`;

export async function POST(request: Request) {
  const formData = await request.formData();
  const media = formData.get("media");
  // Built in the browser (see makeThumbnail in page.tsx): downscaling there
  // keeps a multi-megabyte original off the request and out of the database.
  const thumbField = formData.get("thumbnail");
  const thumbnail =
    typeof thumbField === "string" && thumbField.startsWith("data:image/")
      ? thumbField
      : null;

  if (!(media instanceof File)) {
    return NextResponse.json({ error: "No image or video file provided" }, { status: 400 });
  }

  const isVideo = media.type.startsWith("video/");
  const isImage = media.type.startsWith("image/");

  if (!isVideo && !isImage) {
    return NextResponse.json(
      { error: "Unsupported file type. Upload an image or video." },
      { status: 400 },
    );
  }

  if (media.size > MAX_INLINE_BYTES) {
    return NextResponse.json(
      {
        error: `File is too large (${(media.size / (1024 * 1024)).toFixed(1)}MB). Keep it under ${MAX_INLINE_BYTES / (1024 * 1024)}MB — for video, trim to a short walkaround clip.`,
      },
      { status: 413 },
    );
  }

  const buffer = Buffer.from(await media.arrayBuffer());
  const mediaType = media.type;

  const instructions = isVideo
    ? "You are inspecting a walkaround video of a vehicle — a bus or a car — for a fleet damage report. First identify whether it is a bus (or other large passenger/commercial vehicle) or a car (sedan, SUV, hatchback, pickup) and set vehicleType accordingly. Watch the whole clip and identify every dent visible on the body of the vehicle, rate each one's severity, and note the mm:ss timestamp where it is best visible. Also note any other visible damage, and give an overall condition assessment and repair recommendation. Price any repair estimate in UAE dirhams (AED) using Dubai bodyshop rates for that vehicle type — not US or European prices. If no vehicle is visible, set vehicleDetected to false and leave the other fields as reasonable defaults." + DAMAGE_SWEEP + RATE_CARD + CHECKLIST_INSTRUCTIONS
    : "You are inspecting a photo of a vehicle — a bus or a car — for a fleet damage report. First identify whether it is a bus (or other large passenger/commercial vehicle) or a car (sedan, SUV, hatchback, pickup) and set vehicleType accordingly. Identify every dent visible on the body of the vehicle, rate each one's severity, note any other visible damage, and give an overall condition assessment and repair recommendation. Price any repair estimate in UAE dirhams (AED) using Dubai bodyshop rates for that vehicle type — not US or European prices. If no vehicle is visible, set vehicleDetected to false and leave the other fields as reasonable defaults." + DAMAGE_SWEEP + RATE_CARD + CHECKLIST_INSTRUCTIONS;

  try {
    const { output } = await generateText({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructions },
            {
              type: "file",
              mediaType,
              data: buffer.toString("base64"),
            },
          ],
        },
      ],
      // Gemini downsamples images by default, which is exactly how a small
      // corner dent disappears. HIGH keeps enough detail to see it, and the
      // raised thinking level buys a more careful sweep of the bodywork.
      providerOptions: {
        google: {
          mediaResolution: "MEDIA_RESOLUTION_HIGH",
          thinkingConfig: { thinkingLevel: "high" },
        },
      },
      output: Output.object({
        name: "DentAnalysis",
        description: "Structured dent/damage analysis of a bus or car photo or video",
        schema: dentAnalysisSchema,
      }),
    });

    const stored = { ...output, thumbnail };

    try {
      await saveAnalysis(media.name, isVideo ? "video" : "image", stored);
    } catch (dbError) {
      console.error("Failed to save analysis to database", dbError);
    }

    return NextResponse.json(stored);
  } catch (error) {
    console.error("Dent analysis failed", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again with a clearer photo or video." },
      { status: 502 },
    );
  }
}
