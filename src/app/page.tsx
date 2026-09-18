"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Database,
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
import type { AnalysesResponse } from "@/app/api/analyses/route";
import LiveScanner from "@/components/LiveScanner";
import BrandMark from "@/components/BrandMark";
import FleetSummary from "@/components/FleetSummary";
import InspectionResult from "@/components/InspectionResult";
import HistoryView from "@/components/HistoryView";
import { ConditionBadge, SeverityChip } from "@/components/Badges";
import { SEVERITY_ORDER, isSeverity, type Severity } from "@/lib/damage-tokens";

const MAX_CONCURRENT_ANALYSES = 3;

/**
 * Redraw a queued file onto a canvas at its native size, for storage.
 *
 * No resizing, no cropping — the canvas is exactly the source's own
 * dimensions. Videos get their first drawable frame. Any failure resolves
 * to null — a missing preview must never stop an inspection from running.
 */
async function makeThumbnail(file: File): Promise<string | null> {
  try {
    const url = URL.createObjectURL(file);
    try {
      const source = await new Promise<
        HTMLImageElement | HTMLVideoElement | null
      >((resolve) => {
        if (file.type.startsWith("video/")) {
          const v = document.createElement("video");
          v.muted = true;
          v.preload = "metadata";
          v.onloadeddata = () => resolve(v);
          v.onerror = () => resolve(null);
          v.src = url;
        } else {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = () => resolve(null);
          img.src = url;
        }
      });
      if (!source) return null;

      const sw =
        source instanceof HTMLVideoElement
          ? source.videoWidth
          : source.naturalWidth;
      const sh =
        source instanceof HTMLVideoElement
          ? source.videoHeight
          : source.naturalHeight;
      if (!sw || !sh) return null;

      const canvas = document.createElement("canvas");
      canvas.width = sw;
      canvas.height = sh;
      const ctx = canvas.getContext("2d");
      if (!ctx) return null;

      ctx.drawImage(source, 0, 0);
      return canvas.toDataURL("image/jpeg", 0.8);
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return null;
  }
}

type QueueStatus = "pending" | "analyzing" | "done" | "error";

type QueueItem = {
  id: string;
  file: File;
  previewUrl: string;
  status: QueueStatus;
  result: DentAnalysis | null;
  error: string | null;
};

type HistoryState = { configured: boolean; failed: boolean };

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

/** Highest severity present, for the collapsed one-line summary of a result. */
function worstSeverity(result: DentAnalysis): Severity | null {
  let worst: Severity | null = null;
  for (const d of result.dents) {
    if (!isSeverity(d.severity)) continue;
    if (
      worst === null ||
      SEVERITY_ORDER.indexOf(d.severity) > SEVERITY_ORDER.indexOf(worst)
    ) {
      worst = d.severity;
    }
  }
  return worst;
}

function StatusBadge({ status }: { status: QueueStatus }) {
  switch (status) {
    case "analyzing":
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-white/10 dark:text-slate-300">
          <Loader2 className="size-3 animate-spin" />
          Analyzing
        </span>
      );
    case "done":
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
          <CheckCircle2 className="size-3" />
          Done
        </span>
      );
    case "error":
      return (
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-400">
          <AlertTriangle className="size-3" />
          Failed
        </span>
      );
    default:
      return (
        <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-500 dark:bg-white/10 dark:text-slate-400">
          Queued
        </span>
      );
  }
}

/** Placeholder shown while a file is in flight, so the row keeps its weight. */
function AnalyzingSkeleton() {
  return (
    <div className="flex animate-pulse flex-col gap-2 border-t border-slate-200 pt-4 dark:border-white/10">
      <div className="h-3 w-1/3 rounded bg-slate-200 dark:bg-white/10" />
      <div className="h-3 w-4/5 rounded bg-slate-200 dark:bg-white/10" />
      <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-white/10" />
    </div>
  );
}

export default function Home() {
  const [mode, setMode] = useState<"upload" | "live" | "history">("upload");
  const [items, setItems] = useState<QueueItem[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [batchRunning, setBatchRunning] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [history, setHistory] = useState<AnalysisRecord[]>([]);
  const [historyState, setHistoryState] = useState<HistoryState>({
    configured: true,
    failed: false,
  });
  // The sidebar is a preview strip: opening a record hands it to the History
  // tab, which has the width to show the report properly.
  const [openInHistoryId, setOpenInHistoryId] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  function openRecordInHistory(id: number) {
    setOpenInHistoryId(id);
    setMode("history");
  }

  async function loadHistory() {
    try {
      const res = await fetch("/api/analyses");
      if (!res.ok) {
        setHistoryState({ configured: true, failed: true });
        return;
      }
      const data = (await res.json()) as AnalysesResponse;
      setHistory(data.analyses);
      setHistoryState({ configured: data.configured, failed: data.failed });
    } catch {
      setHistoryState({ configured: true, failed: true });
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
      if (next.has(id)) next.delete(id);
      else next.add(id);
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

      const thumbnail = await makeThumbnail(item.file);
      if (thumbnail) formData.append("thumbnail", thumbnail);

      const res = await fetch("/api/analyze-dents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Analysis failed");

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
  const completed = items
    .filter((it) => it.status === "done" && it.result)
    .map((it) => it.result as DentAnalysis);

  return (
    <div className="flex min-h-full flex-1 flex-col font-sans">
      <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/85 backdrop-blur-md dark:border-white/10 dark:bg-[#060c1c]/85">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">
          <BrandMark />
          <span
            aria-hidden
            className="hidden h-6 w-px bg-slate-200 sm:block dark:bg-white/15"
          />
          <div className="hidden min-w-0 flex-col sm:flex">
            <span className="truncate text-sm font-semibold text-slate-900 dark:text-white">
              Fleet Damage Inspection
            </span>
            <span className="truncate text-xs text-slate-500 dark:text-slate-400">
              AI condition reports for bus and car fleets
            </span>
          </div>

          <div className="ml-auto flex max-w-full shrink gap-1 overflow-x-auto rounded-full bg-slate-100 p-1 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setMode("upload")}
              aria-pressed={mode === "upload"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 ${
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
              onClick={() => setMode("history")}
              aria-pressed={mode === "history"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 ${
                mode === "history"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <History className="size-4" />
              History
              {history.length > 0 && (
                <span className="rounded-full bg-slate-200 px-1.5 text-[10px] font-semibold text-slate-600 dark:bg-white/15 dark:text-slate-300">
                  {history.length}
                </span>
              )}
            </button>
            <button
              type="button"
              onClick={() => setMode("live")}
              aria-pressed={mode === "live"}
              className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors sm:px-4 ${
                mode === "live"
                  ? "bg-white text-slate-900 shadow-xs dark:bg-white/10 dark:text-white"
                  : "text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              }`}
            >
              <Video className="size-4" />
              Live
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {mode === "upload" && <FleetSummary analyses={completed} />}

        {mode === "history" && (
          <HistoryView
            key={openInHistoryId ?? "all"}
            history={history}
            configured={historyState.configured}
            failed={historyState.failed}
            openId={openInHistoryId}
          />
        )}

        <div
          className={`${mode === "history" ? "hidden" : "grid"} items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]`}
        >
          <div className="flex flex-col gap-6">
            {mode === "live" && <LiveScanner onReportSaved={loadHistory} />}

            {mode === "upload" && (
              <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-xs sm:p-6 dark:border-white/10 dark:bg-white/5">
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
                      ? "border-[#ef6306] bg-[#ef6306]/5"
                      : "border-slate-200 hover:border-[#ef6306]/60 hover:bg-slate-50 dark:border-white/15 dark:hover:border-[#ef6306]/60 dark:hover:bg-white/5"
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

                  <div className="flex size-11 items-center justify-center rounded-full bg-[#ef6306]/10 text-[#ef6306] transition-transform group-hover:scale-105">
                    <ImagePlus className="size-5" />
                  </div>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                    Drop photos or videos here, or click to browse
                  </p>
                  <p className="text-xs text-slate-400 dark:text-slate-500">
                    Multiple files at once — PNG/JPG or MP4/MOV, up to 15MB each
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
                      {items.map((item) => {
                        const worst = item.result
                          ? worstSeverity(item.result)
                          : null;
                        return (
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
                                  {(item.file.size / (1024 * 1024)).toFixed(1)}{" "}
                                  MB
                                </p>
                              </div>

                              <StatusBadge status={item.status} />

                              {item.status === "done" && item.result && (
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(item.id)}
                                  aria-label="Toggle details"
                                  aria-expanded={expanded.has(item.id)}
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

                            {/* Headline verdict stays visible when the panel is collapsed. */}
                            {item.status === "done" &&
                              item.result &&
                              !expanded.has(item.id) && (
                                <div className="flex flex-wrap items-center gap-2">
                                  <ConditionBadge
                                    condition={item.result.overallCondition}
                                  />
                                  <span className="text-xs text-slate-500 dark:text-slate-400">
                                    {item.result.dents.length} dent
                                    {item.result.dents.length === 1 ? "" : "s"}
                                  </span>
                                  {worst && (
                                    <>
                                      <span className="text-xs text-slate-300 dark:text-slate-600">
                                        ·
                                      </span>
                                      <span className="text-xs text-slate-500 dark:text-slate-400">
                                        worst
                                      </span>
                                      <SeverityChip severity={worst} />
                                    </>
                                  )}
                                </div>
                              )}

                            {item.status === "analyzing" && (
                              <AnalyzingSkeleton />
                            )}

                            {item.status === "error" && item.error && (
                              <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700 dark:bg-red-500/10 dark:text-red-400">
                                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                                <p>{item.error}</p>
                              </div>
                            )}

                            {item.status === "done" &&
                              item.result &&
                              expanded.has(item.id) && (
                                <InspectionResult
                                  result={item.result}
                                  fileName={item.file.name}
                                />
                              )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                )}

                <button
                  onClick={handleAnalyzeAll}
                  disabled={pendingCount === 0 || batchRunning}
                  className="flex w-full items-center justify-center gap-2 rounded-full bg-[#ef6306] px-5 py-3 text-sm font-medium text-white shadow-md shadow-[#ef6306]/20 transition-all hover:bg-[#d15705] hover:shadow-lg hover:shadow-[#ef6306]/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
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
          </div>

          <aside className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-5 shadow-xs dark:border-white/10 dark:bg-white/5">
            <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
              <History className="size-3.5" />
              Recent inspections
            </h2>

            {!historyState.configured && (
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-500 dark:bg-white/5 dark:text-slate-400">
                <Database className="mt-0.5 size-3.5 shrink-0" />
                <p>
                  History is off — no database is connected. Analyses still run
                  normally, they are just not saved.
                </p>
              </div>
            )}

            {historyState.configured && historyState.failed && (
              <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                <p>Could not load history right now. Analysis is unaffected.</p>
              </div>
            )}

            {historyState.configured &&
              !historyState.failed &&
              history.length === 0 && (
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  Nothing yet. Completed inspections will appear here.
                </p>
              )}

            {history.length > 0 && (
              <ul className="flex flex-col gap-2">
                {history.slice(0, 6).map((entry) => {
                  const plate =
                    entry.result?.vehicle?.plateNumber ??
                    entry.result?.vehicle?.assetId ??
                    null;
                  return (
                    <li key={entry.id}>
                      <button
                        type="button"
                        onClick={() => openRecordInHistory(entry.id)}
                        className="flex w-full flex-col gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-left transition-colors hover:border-[#ef6306]/50 hover:bg-[#ef6306]/5 dark:border-white/10 dark:hover:border-[#ef6306]/50"
                      >
                        <span className="block truncate text-sm font-medium text-slate-700 dark:text-slate-200">
                          {plate ?? entry.fileName}
                        </span>
                        <span className="flex items-center justify-between gap-2">
                          <span className="truncate text-xs text-slate-400 dark:text-slate-500">
                            {new Date(entry.createdAt).toLocaleDateString(
                              "en-AE",
                              { day: "2-digit", month: "short" },
                            )}{" "}
                            · {entry.dentsCount} finding
                            {entry.dentsCount === 1 ? "" : "s"}
                          </span>
                          <ConditionBadge condition={entry.overallCondition} />
                        </span>
                      </button>
                    </li>
                  );
                })}
                {history.length > 6 && (
                  <li>
                    <button
                      type="button"
                      onClick={() => setMode("history")}
                      className="w-full rounded-lg px-3 py-2 text-xs font-medium text-[#ef6306] transition-colors hover:bg-[#ef6306]/5"
                    >
                      View all {history.length} inspections →
                    </button>
                  </li>
                )}
              </ul>
            )}
          </aside>
        </div>
      </main>
    </div>
  );
}
