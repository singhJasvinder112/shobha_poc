import { google } from "@ai-sdk/google";
import { generateText, Output } from "ai";
import { NextResponse } from "next/server";
import { dentAnalysisSchema } from "@/lib/dent-analysis-schema";
import { saveAnalysis, type TranscriptTurn } from "@/lib/db";

export const maxDuration = 60;

const MODEL = google("gemini-3.8-flash");

const INSTRUCTIONS =
  "You just finished a live camera inspection session of a bus: you watched its " +
  "video feed in real time and answered questions about visible damage as they " +
  "came up. Below is the transcript of that session. Consolidate everything you " +
  "observed into a single structured damage report — merge repeated or duplicate " +
  "observations of the same dent into one entry. If the transcript never confirms " +
  "a bus was in view, set vehicleDetected to false and leave the other fields as " +
  "reasonable defaults.";

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
          content: `${INSTRUCTIONS}\n\nTranscript:\n${conversation}`,
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
