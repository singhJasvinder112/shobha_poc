import { google } from "@ai-sdk/google";
import { NextResponse } from "next/server";

export const maxDuration = 30;

const LIVE_MODEL = "gemini-3.1-flash-live-preview";

const LIVE_INSTRUCTIONS =
  "You are inspecting a live camera feed of a bus for a fleet damage report. " +
  "You continuously receive frames from the camera. When asked what you see, " +
  "describe any dents or damage currently visible: their location on the bus " +
  "body, approximate size, and severity (minor, moderate, or severe). Be brief " +
  "and specific to what is visible right now. If no bus is in view, say so " +
  "instead of guessing.";

// Mints a short-lived Gemini Live client token so the browser can open the
// realtime WebSocket directly, without ever seeing the server's API key.
export async function POST() {
  try {
    const { token, url, expiresAt } =
      await google.experimental_realtime.getToken({
        model: LIVE_MODEL,
        sessionConfig: {
          instructions: LIVE_INSTRUCTIONS,
          // gemini-3.1-flash-live-preview only supports audio output; request
          // a text transcript of that audio so the client can render it.
          outputModalities: ["audio"],
          outputAudioTranscription: {},
        },
        expiresAfterSeconds: 60,
      });

    return NextResponse.json({
      token,
      url,
      expiresAt,
      model: LIVE_MODEL,
      instructions: LIVE_INSTRUCTIONS,
    });
  } catch (error) {
    console.error("Failed to create live session token", error);
    return NextResponse.json(
      { error: "Could not start the live session. Please try again." },
      { status: 502 },
    );
  }
}
