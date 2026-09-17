import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { dentAnalysisSchema } from "@/lib/dent-analysis-schema";

export const maxDuration = 60;

const MODEL = google("gemini-3.8-flash");

// Gemini's inline (non-Files-API) request payload is capped around 20MB;
// base64 adds ~33% overhead, so keep the raw upload well under that.
const MAX_INLINE_BYTES = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const formData = await request.formData();
  const media = formData.get("media");

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
    ? "You are inspecting a walkaround video of a bus for a fleet damage report. Watch the whole clip and identify every dent visible on the body of the bus, rate each one's severity, and note the mm:ss timestamp where it is best visible. Also note any other visible damage, and give an overall condition assessment and repair recommendation. If no bus is visible, set vehicleDetected to false and leave the other fields as reasonable defaults."
    : "You are inspecting a photo of a bus for a fleet damage report. Identify every dent visible on the body of the bus, rate each one's severity, note any other visible damage, and give an overall condition assessment and repair recommendation. If no bus is visible, set vehicleDetected to false and leave the other fields as reasonable defaults.";

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
      output: Output.object({
        name: "DentAnalysis",
        description: "Structured dent/damage analysis of a bus photo or video",
        schema: dentAnalysisSchema,
      }),
    });

    return NextResponse.json(output);
  } catch (error) {
    console.error("Dent analysis failed", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again with a clearer photo or video." },
      { status: 502 },
    );
  }
}
