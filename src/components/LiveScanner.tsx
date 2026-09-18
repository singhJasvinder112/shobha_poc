"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ClipboardList,
  Loader2,
  Radio,
  Send,
  Video,
  VideoOff,
} from "lucide-react";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";
import InspectionResult from "@/components/InspectionResult";
import { LiveAudioPlayer } from "@/lib/live-audio";

type LogEntry = {
  id: string;
  role: "user" | "assistant";
  text: string;
};

type LiveStatus = "idle" | "connecting" | "live" | "error";

type LiveTokenResponse = {
  token: string;
  url: string;
  model: string;
  instructions: string;
  error?: string;
};

const AUTO_SCAN_PROMPT =
  "Look at the current camera view. In one short sentence, report any dent or damage you can currently see (location, approximate size, severity), or say 'Nothing visible right now' if there is none.";

const FRAME_INTERVAL_MS = 1000;
const AUTO_SCAN_INTERVAL_MS = 6000;
const FRAME_MAX_WIDTH = 768;

export default function LiveScanner({
  onReportSaved,
}: {
  onReportSaved?: () => void;
} = {}) {
  const [status, setStatus] = useState<LiveStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [autoScan, setAutoScan] = useState(true);
  const [question, setQuestion] = useState("");
  const [awaitingResponse, setAwaitingResponse] = useState(false);
  const [report, setReport] = useState<DentAnalysis | null>(null);
  const [sessionLabel, setSessionLabel] = useState("");
  const [reportLoading, setReportLoading] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const autoScanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  const currentAssistantIdRef = useRef<string | null>(null);
  const awaitingResponseRef = useRef(false);
  const autoScanRef = useRef(autoScan);
  // Plays the PCM the model streams back. Without this the assistant
  // 'speaks' and nothing is heard — only its transcript appears.
  const audioRef = useRef<LiveAudioPlayer | null>(null);
  // Guards the async start() sequence: the user can leave Live mode mid-connect,
  // and without this the resumed sequence would build a session nothing can stop.
  const mountedRef = useRef(true);

  useEffect(() => {
    autoScanRef.current = autoScan;
  }, [autoScan]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      cleanupLocalResources();
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []);

  function cleanupLocalResources() {
    void audioRef.current?.dispose();
    audioRef.current = null;
    if (frameIntervalRef.current) clearInterval(frameIntervalRef.current);
    if (autoScanIntervalRef.current) clearInterval(autoScanIntervalRef.current);
    frameIntervalRef.current = null;
    autoScanIntervalRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    currentAssistantIdRef.current = null;
    awaitingResponseRef.current = false;
    setAwaitingResponse(false);
  }

  function stop() {
    cleanupLocalResources();
    wsRef.current?.close();
    wsRef.current = null;
    setStatus("idle");
  }

  function appendAssistantDelta(delta: string) {
    // The ref mutation must happen here, outside the setLog updater: React
    // (in Strict Mode / dev) can invoke a state updater more than once, and
    // a side effect inside it (like advancing this ref) corrupts the result
    // on the second call, silently dropping the appended text.
    const existingId = currentAssistantIdRef.current;
    if (!existingId) {
      const newId = crypto.randomUUID();
      currentAssistantIdRef.current = newId;
      setLog((prev) => [
        ...prev,
        { id: newId, role: "assistant", text: delta },
      ]);
      return;
    }
    setLog((prev) =>
      prev.map((entry) =>
        entry.id === existingId
          ? { ...entry, text: entry.text + delta }
          : entry,
      ),
    );
  }

  function sendTurn(text: string) {
    const ws = wsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN || !text.trim()) return;
    setLog((prev) => [
      ...prev,
      { id: crypto.randomUUID(), role: "user", text },
    ]);
    currentAssistantIdRef.current = null;
    awaitingResponseRef.current = true;
    setAwaitingResponse(true);
    ws.send(
      JSON.stringify({
        clientContent: {
          turns: [{ role: "user", parts: [{ text }] }],
          turnComplete: true,
        },
      }),
    );
  }

  function captureFrame() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ws = wsRef.current;
    if (!video || !canvas || !ws || ws.readyState !== WebSocket.OPEN) return;
    if (!video.videoWidth) return;
    // Sending realtime input while a turn is being generated can cause
    // the Live API to treat it as new activity and cut the response short.
    if (awaitingResponseRef.current) return;

    const scale = Math.min(1, FRAME_MAX_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.5);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);

    ws.send(
      JSON.stringify({
        realtimeInput: { video: { mimeType: "image/jpeg", data: base64 } },
      }),
    );
  }

  async function readSocketMessage(data: string | ArrayBuffer | Blob) {
    if (typeof data === "string") return data;
    if (data instanceof Blob) return data.text();
    return new TextDecoder().decode(data);
  }

  async function start() {
    // Browsers expose getUserMedia only in a secure context: https, or
    // localhost. Over http on a LAN IP (a phone hitting 192.168.x.x) the call
    // rejects with a bare NotAllowedError, which reads like a denied permission
    // prompt. Name the real cause instead.
    if (typeof window !== "undefined" && !window.isSecureContext) {
      setError(
        "The camera needs a secure connection. This page is on plain http, so the browser blocks it. Open it on https, or on localhost on this machine.",
      );
      setStatus("idle");
      return;
    }

    setStatus("connecting");
    setError(null);

    // Created here, inside the click handler: browsers block an AudioContext
    // started outside a user gesture, and it fails silently.
    audioRef.current = new LiveAudioPlayer();
    await audioRef.current.start();
    setLog([]);
    setReport(null);
    setReportError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
        audio: false,
      });
      if (!mountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const tokenRes = await fetch("/api/live-token", { method: "POST" });
      const tokenData = (await tokenRes.json()) as LiveTokenResponse;
      if (!tokenRes.ok) {
        throw new Error(tokenData.error ?? "Could not start the live session");
      }

      if (!mountedRef.current) {
        cleanupLocalResources();
        return;
      }

      const ws = new WebSocket(
        `${tokenData.url}?access_token=${encodeURIComponent(tokenData.token)}`,
      );
      wsRef.current = ws;

      ws.onopen = () => {
        ws.send(
          JSON.stringify({
            setup: {
              model: `models/${tokenData.model}`,
              generationConfig: { responseModalities: ["AUDIO"] },
              outputAudioTranscription: {},
              systemInstruction: { parts: [{ text: tokenData.instructions }] },
            },
          }),
        );
      };

      ws.onmessage = async (event) => {
        const text = await readSocketMessage(event.data);
        let message: Record<string, unknown>;
        try {
          message = JSON.parse(text);
        } catch {
          return;
        }

        if (message.setupComplete) {
          if (!mountedRef.current) {
            ws.close();
            cleanupLocalResources();
            return;
          }
          setStatus("live");
          frameIntervalRef.current = setInterval(
            captureFrame,
            FRAME_INTERVAL_MS,
          );
          autoScanIntervalRef.current = setInterval(() => {
            if (!autoScanRef.current || awaitingResponseRef.current) return;
            sendTurn(AUTO_SCAN_PROMPT);
          }, AUTO_SCAN_INTERVAL_MS);
          return;
        }

        const serverContent = message.serverContent as
          | {
              outputTranscription?: { text?: string };
              modelTurn?: {
                parts?: {
                  inlineData?: { mimeType?: string; data?: string };
                }[];
              };
              turnComplete?: boolean;
              interrupted?: boolean;
            }
          | undefined;
        if (serverContent) {
          // Audio arrives as base64 PCM parts alongside the transcript.
          for (const part of serverContent.modelTurn?.parts ?? []) {
            const inline = part?.inlineData;
            if (!inline?.data) continue;
            if (!(inline.mimeType ?? "").startsWith("audio/")) continue;
            audioRef.current?.enqueue(inline.data);
          }

          if (serverContent.outputTranscription?.text) {
            appendAssistantDelta(serverContent.outputTranscription.text);
          }

          // Barge-in: drop whatever is still queued so the old answer does
          // not keep talking over the new one.
          if (serverContent.interrupted) audioRef.current?.stopCurrent();
          if (serverContent.turnComplete || serverContent.interrupted) {
            if (!currentAssistantIdRef.current) {
              appendAssistantDelta(
                serverContent.interrupted
                  ? "(interrupted before responding)"
                  : "(no response)",
              );
            }
            currentAssistantIdRef.current = null;
            awaitingResponseRef.current = false;
            setAwaitingResponse(false);
          }
          return;
        }

        if (message.error) {
          setError(
            typeof message.error === "string"
              ? message.error
              : "The live session reported an error.",
          );
          currentAssistantIdRef.current = null;
          awaitingResponseRef.current = false;
          setAwaitingResponse(false);
        }
      };

      ws.onerror = () => {
        setError("Live connection error. Please try again.");
        setStatus("error");
      };

      ws.onclose = () => {
        cleanupLocalResources();
        setStatus((prev) => (prev === "error" ? prev : "idle"));
      };
    } catch (err) {
      cleanupLocalResources();
      setError(
        err instanceof Error ? err.message : "Could not access the camera",
      );
      setStatus("error");
    }
  }

  function handleAsk(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim()) return;
    sendTurn(question.trim());
    setQuestion("");
  }

  async function generateReport() {
    if (log.length === 0) return;
    setReportLoading(true);
    setReportError(null);
    setReport(null);
    setSessionLabel(new Date().toLocaleString("en-AE"));

    try {
      const res = await fetch("/api/analyze-live", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          transcript: log.map((entry) => ({
            role: entry.role,
            text: entry.text,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Could not generate a report");
      }

      setReport(data as DentAnalysis);
      onReportSaved?.();
    } catch (err) {
      setReportError(
        err instanceof Error ? err.message : "Could not generate a report",
      );
    } finally {
      setReportLoading(false);
    }
  }

  const isLive = status === "live";
  const isConnecting = status === "connecting";

  return (
    <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-xs dark:border-white/10 dark:bg-white/5">
      <div className="relative overflow-hidden rounded-xl bg-slate-900">
        <video
          ref={videoRef}
          playsInline
          muted
          className={`max-h-96 w-full object-contain ${isLive || isConnecting ? "" : "hidden"}`}
        />
        {!isLive && !isConnecting && (
          <div className="flex h-48 flex-col items-center justify-center gap-2 text-slate-400">
            <Video className="size-8" />
            <p className="text-sm">Camera preview will appear here</p>
          </div>
        )}
        <canvas ref={canvasRef} className="hidden" />
        {isLive && (
          <span className="absolute top-3 left-3 flex items-center gap-1.5 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur-sm">
            <Radio className="size-3 animate-pulse text-red-400" />
            Live
          </span>
        )}
      </div>

      <div className="flex items-center gap-3">
        {!isLive ? (
          <button
            onClick={start}
            disabled={isConnecting}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-linear-to-r from-orange-600 to-amber-600 px-5 py-3 text-sm font-medium text-white shadow-md shadow-orange-600/20 transition-all hover:shadow-lg hover:shadow-orange-600/30 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isConnecting ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Connecting…
              </>
            ) : (
              <>
                <Video className="size-4" />
                Start live scan
              </>
            )}
          </button>
        ) : (
          <button
            onClick={stop}
            className="flex flex-1 items-center justify-center gap-2 rounded-full bg-slate-800 px-5 py-3 text-sm font-medium text-white transition-colors hover:bg-slate-900 dark:bg-white/10 dark:hover:bg-white/20"
          >
            <VideoOff className="size-4" />
            Stop live scan
          </button>
        )}

        <label className="flex shrink-0 items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
          <input
            type="checkbox"
            checked={autoScan}
            onChange={(e) => setAutoScan(e.target.checked)}
            className="size-4 rounded border-slate-300"
          />
          Auto-narrate
        </label>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{error}</p>
        </div>
      )}

      <form onSubmit={handleAsk} className="flex items-center gap-2">
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          disabled={!isLive || awaitingResponse}
          placeholder={
            awaitingResponse
              ? "Waiting for a response…"
              : "Ask about what's currently in view…"
          }
          className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm outline-none focus:border-orange-400 disabled:opacity-40 dark:border-white/10 dark:bg-white/5 dark:text-white"
        />
        <button
          type="submit"
          disabled={!isLive || awaitingResponse || !question.trim()}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-orange-600 text-white disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send"
        >
          <Send className="size-4" />
        </button>
      </form>

      {log.length > 0 && (
        <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto rounded-xl bg-slate-50 p-3 dark:bg-white/5">
          {log.map((entry) => (
            <li
              key={entry.id}
              className={`max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                entry.role === "user"
                  ? "self-end bg-orange-600 text-white"
                  : "self-start bg-white text-slate-700 shadow-xs dark:bg-white/10 dark:text-slate-200"
              }`}
            >
              {entry.text}
            </li>
          ))}
        </ul>
      )}

      {log.length > 0 && (
        <button
          type="button"
          onClick={generateReport}
          disabled={reportLoading}
          className="flex w-full items-center justify-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-5 py-3 text-sm font-medium text-orange-700 transition-colors hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50 dark:border-orange-500/20 dark:bg-orange-500/10 dark:text-orange-400 dark:hover:bg-orange-500/20"
        >
          {reportLoading ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              Generating report…
            </>
          ) : (
            <>
              <ClipboardList className="size-4" />
              Generate damage report from this session
            </>
          )}
        </button>
      )}

      {reportError && (
        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>{reportError}</p>
        </div>
      )}

      {report && (
        <div className="rounded-xl border border-slate-200 p-4 dark:border-white/10">
          <InspectionResult
            result={report}
            fileName={`Live walkaround — ${sessionLabel}`}
          />
        </div>
      )}
    </section>
  );
}
