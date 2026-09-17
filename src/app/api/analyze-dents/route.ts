import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { dentAnalysisSchema } from "@/lib/dent-analysis-schema";

export const maxDuration = 60;

const MODEL = google("gemini-3.8-flash");

export async function POST(request: Request) {
  const formData = await request.formData();
  const image = formData.get("image");

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "No image file provided" }, { status: 400 });
  }

  const buffer = Buffer.from(await image.arrayBuffer());
  const mediaType = image.type || "image/jpeg";

  try {
    const { output } = await generateText({
      model: MODEL,
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "You are inspecting a photo of a bus for a fleet damage report. Identify every dent visible on the body of the bus, rate each one's severity, note any other visible damage, and give an overall condition assessment and repair recommendation. If no bus is visible, set vehicleDetected to false and leave the other fields as reasonable defaults.",
            },
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
        description: "Structured dent/damage analysis of a bus photo",
        schema: dentAnalysisSchema,
      }),
    });

    return NextResponse.json(output);
  } catch (error) {
    console.error("Dent analysis failed", error);
    return NextResponse.json(
      { error: "Analysis failed. Please try again with a clearer photo." },
      { status: 502 },
    );
  }
}
