"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Bus,
  CheckCircle2,
  ChevronDown,
  Film,
  History,
  ImagePlus,
  Loader2,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";
import type { AnalysisRecord } from "@/lib/db";
import LiveScanner from "@/components/LiveScanner";
import {
  AnalysisDetails,
  CONDITION_STYLES,
} from "@/components/AnalysisDetails";

const MAX_CONCURRENT_ANALYSES = 3;

type QueueStatus = "pending" | "analyzing" | "done" | "error";

type QueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  result: DentAnalysis | null;
  error: string | null;
};

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let index = 0;

  async function runNext(): Promise<void> {
    const current = index++;
    if (current >= items.length) return;
    await worker(items[current]);
    return runNext();
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, runNext),
  );
}

function StatusBadge({ status }: { status: QueueStatus }) {
  switch (status) {
    case "analyzing":
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-600 dark:bg-orange-500/10 dark:text-orange-400">
          <Loader2 className="size-3 animate-spin" />
          Analyzing
        </span>
      );
    case "done":
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
          <CheckCircle2 className="size-3" />
          Done
        </span>
      );
    case "error":
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-600 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle className="size-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
          Pending
        </span>
      );
  }
}

export default function Home() {
  const [mode, setMode] = useState<"upload" | "live">("upload");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [expandedHistory, setExpandedHistory] = useState<Set<number>>(
    new Set(),
  );
  const inputRef = useRef<HTMLInputElement>(null);

  function toggleHistoryExpand(id: number) {
    setExpandedHistory((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/analyses");
      if (!res.ok) return;
      setHistory((await res.json()) as AnalysisRecord[]);
    } catch {
      // history is a nice-to-have; ignore failures
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch-on-mount, setState happens after await
    loadHistory();
  }, []);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const files = Array.from(fileList).filter(
      (f) => f.type.startsWith("image/") || f.type.startsWith("video/"),
    );
    if (files.length === 0) return;

    const newItems: QueueItem[] = files.map((file) => ({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
      status: "pending",
      result: null,
      error: null,
    }));
    setItems((prev) => [...prev, ...newItems]);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    addFiles(e.dataTransfer.files);
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const target = prev.find((it) => it.id === id);
      if (target) URL.revokeObjectURL(target.previewUrl);
      return prev.filter((it) => it.id !== id);
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  }

  function clearAll() {
    items.forEach((it) => URL.revokeObjectURL(it.previewUrl));
    setItems([]);
    setExpanded(new Set());
    if (inputRef.current) inputRef.current.value = "";
  }

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  async function analyzeOne(item: QueueItem) {
    setItems((prev) =>
      prev.map((it) =>
        it.id === item.id ? { ...it, status: "analyzing", error: null } : it,
      ),
    );

    try {
      const formData = new FormData();
      formData.append("media", item.file);

      const res = await fetch("/api/analyze-dents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Analysis failed");
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id
            ? { ...it, status: "done", result: data as DentAnalysis }
            : it,
        ),
      );
      setExpanded((prev) => new Set(prev).add(item.id));
      loadHistory();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong";
      setItems((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, status: "error", error: message } : it,
        ),
      );
    }
  }

  async function handleAnalyzeAll() {
    const pending = items.filter(
      (it) => it.status === "pending" || it.status === "error",
    );
    if (pending.length === 0) return;

    setBatchRunning(true);
    try {
      await runWithConcurrency(pending, MAX_CONCURRENT_ANALYSES, analyzeOne);
    } finally {
      setBatchRunning(false);
    }
  }

  const pendingCount = items.filter(
    (it) => it.status === "pending" || it.status === "error",
  ).length;
  const doneCount = items.filter((it) => it.status === "done").length;

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/25">
            <Bus className="size-6 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Bus Dent Analysis
          </h1>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            Upload bus photos or walkaround videos, or scan live with your
            camera, and Gemini will identify dents, rate severity, and suggest
            next steps.
          </p>
        </header>

        <div className="flex gap-1 self-center rounded-full bg-slate-100 p-1 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setMode("upload")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "upload"
                ? "bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <ImagePlus className="size-4" />
            Upload
          </button>
          <button
            type="button"
            onClick={() => setMode("live")}
            className={`flex items-center gap-1.5 rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              mode === "live"
                ? "bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white"
                : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
            }`}
          >
            <Video className="size-4" />
            Live
          </button>
        </div>

        {mode === "live" && <LiveScanner onReportSaved={loadHistory} />}

        {mode === "upload" && (
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <label
              htmlFor="bus-photo"
              onDragOver={(e) => {
                e.preventDefault();
                setDragActive(true);
              }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
              className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
                dragActive
                  ? "border-orange-500 bg-orange-50 dark:bg-orange-500/10"
                  : "border-slate-200 hover:border-orange-400 hover:bg-slate-50 dark:border-white/15 dark:hover:border-orange-400/60 dark:hover:bg-white/5"
              }`}
            >
              <input
                ref={inputRef}
                id="bus-photo"
                type="file"
                accept="image/*,video/*"
                multiple
                onChange={handleFileChange}
                className="sr-only"
              />

              <div className="flex size-11 items-center justify-center rounded-full bg-orange-50 text-orange-600 transition-transform group-hover:scale-105 dark:bg-orange-500/10 dark:text-orange-400">
                <ImagePlus className="size-5" />
              </div>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                Drop photos or videos here, or click to browse
              </p>
              <p className="text-xs text-slate-400 dark:text-slate-500">
                Select multiple files at once — PNG/JPG or MP4/MOV, up to 15MB
                each
              </p>
            </label>

            {items.length > 0 && (
              <>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                    {items.length} file{items.length === 1 ? "" : "s"} ·{" "}
                    {doneCount} done
                  </span>
                  <button
                    type="button"
                    onClick={clearAll}
                    disabled={batchRunning}
                    className="flex items-center gap-1 text-xs font-medium text-slate-400 transition-colors hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-slate-500 dark:hover:text-red-400"
                  >
                    <Trash2 className="size-3.5" />
                    Clear all
                  </button>
                </div>

                <ul className="flex flex-col gap-3">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex flex-col gap-3 rounded-xl border border-slate-200 p-3 dark:border-white/10"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative size-14 shrink-0 overflow-hidden rounded-lg bg-slate-100 dark:bg-slate-900">
                          {item.file.type.startsWith("video/") ? (
                            <>
                              <video
                                src={item.previewUrl}
                                muted
                                preload="metadata"
                                className="size-full object-cover"
                              />
                              <div className="absolute inset-0 flex items-center justify-center bg-black/25">
                                <Film className="size-4 text-white" />
                              </div>
                            </>
                          ) : (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              src={item.previewUrl}
                              alt={item.file.name}
                              className="size-full object-cover"
                            />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                            {item.file.name}
                          </p>
                          <p className="text-xs text-slate-400 dark:text-slate-500">
                            {(item.file.size / (1024 * 1024)).toFixed(1)} MB
                          </p>
                        </div>

                        <StatusBadge status={item.status} />

                        {item.status === "done" && item.result && (
                          <button
                            type="button"
                            onClick={() => toggleExpand(item.id)}
                            aria-label="Toggle details"
                            className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-white/10 dark:hover:text-slate-300"
                          >
                            <ChevronDown
                              className={`size-4 transition-transform ${expanded.has(item.id) ? "rotate-180" : ""}`}
                            />
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => removeItem(item.id)}
                          disabled={item.status === "analyzing"}
                          aria-label="Remove file"
                          className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-white/10 dark:hover:text-red-400"
                        >
                          <X className="size-4" />
                        </button>
                      </div>

                      {item.status === "error" && item.error && (
                        <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
                          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                          <p>{item.error}</p>
                        </div>
                      )}

                      {item.status === "done" &&
                        item.result &&
                        expanded.has(item.id) && (
                          <AnalysisDetails result={item.result} />
                        )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            <button
              onClick={handleAnalyzeAll}
              disabled={pendingCount === 0 || batchRunning}
              className="flex w-full items-center justify-center gap-2 rounded-full bg-linear-to-r from-orange-600 to-amber-600 px-5 py-3 text-sm font-medium text-white shadow-md shadow-orange-600/20 transition-all hover:shadow-lg hover:shadow-orange-600/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {batchRunning ? (
                <>
                  <Loader2 className="size-4 animate-spin" />
                  Analyzing…
                </>
              ) : (
                <>
                  <Sparkles className="size-4" />
                  Analyze {pendingCount > 0 ? pendingCount : ""} file
                  {pendingCount === 1 ? "" : "s"}
                </>
              )}
            </button>
          </section>
        )}

        {history.length > 0 && (
          <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
              <History className="size-3.5" />
              Recent analyses
            </h2>
            <ul className="flex flex-col gap-3">
              {history.map((entry) => {
                const isOpen = expandedHistory.has(entry.id);
                return (
                  <li
                    key={entry.id}
                    className="rounded-xl border border-slate-200 dark:border-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => toggleHistoryExpand(entry.id)}
                      aria-expanded={isOpen}
                      className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm"
                    >
                      <div className="flex min-w-0 flex-col">
                        <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                          {entry.fileName}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500">
                          {new Date(entry.createdAt).toLocaleString()} ·{" "}
                          {entry.dentsCount} dent
                          {entry.dentsCount === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${CONDITION_STYLES[entry.overallCondition] ?? ""}`}
                        >
                          {entry.overallCondition}
                        </span>
                        <ChevronDown
                          className={`size-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`}
                        />
                      </div>
                    </button>

                    {isOpen && (
                      <div className="px-3 pb-4">
                        <AnalysisDetails result={entry.result} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
