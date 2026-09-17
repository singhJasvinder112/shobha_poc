"use client";

import { useRef, useState } from "react";
import {
  AlertTriangle,
  Bus,
  CheckCircle2,
  Film,
  ImagePlus,
  Loader2,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import type { DentAnalysis } from "@/lib/dent-analysis-schema";

const SEVERITY_STYLES: Record<string, string> = {
  minor:
    "bg-yellow-50 text-yellow-700 ring-1 ring-inset ring-yellow-600/20 dark:bg-yellow-500/10 dark:text-yellow-400 dark:ring-yellow-500/20",
  moderate:
    "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20",
  severe:
    "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
};

const CONDITION_STYLES: Record<string, string> = {
  excellent:
    "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-500/20",
  good: "bg-lime-50 text-lime-700 ring-1 ring-inset ring-lime-600/20 dark:bg-lime-500/10 dark:text-lime-400 dark:ring-lime-500/20",
  fair: "bg-orange-50 text-orange-700 ring-1 ring-inset ring-orange-600/20 dark:bg-orange-500/10 dark:text-orange-400 dark:ring-orange-500/20",
  poor: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-500/20",
};

export default function Home() {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<DentAnalysis | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function selectFile(selected: File | null) {
    setFile(selected);
    setResult(null);
    setError(null);
    setPreviewUrl(selected ? URL.createObjectURL(selected) : null);
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    selectFile(e.target.files?.[0] ?? null);
  }

  function handleDrop(e: React.DragEvent<HTMLLabelElement>) {
    e.preventDefault();
    setDragActive(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped && (dropped.type.startsWith("image/") || dropped.type.startsWith("video/"))) {
      selectFile(dropped);
    }
  }

  function handleClear() {
    selectFile(null);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleAnalyze() {
    if (!file) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("media", file);

      const res = await fetch("/api/analyze-dents", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Analysis failed");
      }

      setResult(data as DentAnalysis);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-1 flex-col items-center font-sans">
      <main className="flex w-full max-w-2xl flex-col gap-8 px-6 py-16">
        <header className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-linear-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/25">
            <Bus className="size-6 text-white" strokeWidth={2} />
          </div>
          <h1 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Bus Dent Analysis
          </h1>
          <p className="max-w-md text-sm text-slate-500 dark:text-slate-400">
            Upload a photo or walkaround video of a bus and Gemini will
            identify dents, rate severity, and suggest next steps.
          </p>
        </header>

        <section className="flex flex-col gap-4 rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
          <label
            htmlFor="bus-photo"
            onDragOver={(e) => {
              e.preventDefault();
              setDragActive(true);
            }}
            onDragLeave={() => setDragActive(false)}
            onDrop={handleDrop}
            className={`group relative flex cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragActive
                ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                : "border-slate-200 hover:border-indigo-400 hover:bg-slate-50 dark:border-white/15 dark:hover:border-indigo-400/60 dark:hover:bg-white/5"
            } ${previewUrl ? "p-0" : ""}`}
          >
            <input
              ref={inputRef}
              id="bus-photo"
              type="file"
              accept="image/*,video/*"
              onChange={handleFileChange}
              className="sr-only"
            />

            {previewUrl && file ? (
              <div className="relative w-full">
                {file.type.startsWith("video/") ? (
                  <video
                    src={previewUrl}
                    controls
                    muted
                    className="max-h-96 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-900"
                  />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={previewUrl}
                    alt="Bus preview"
                    className="max-h-96 w-full rounded-xl bg-slate-100 object-contain dark:bg-slate-900"
                  />
                )}
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    handleClear();
                  }}
                  className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur-sm transition-colors hover:bg-black/80"
                  aria-label="Remove file"
                >
                  <X className="size-4" />
                </button>
              </div>
            ) : (
              <>
                <div className="flex size-11 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 transition-transform group-hover:scale-105 dark:bg-indigo-500/10 dark:text-indigo-400">
                  <ImagePlus className="size-5" />
                </div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  Drop a photo or video here, or click to browse
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  PNG/JPG or MP4/MOV walkaround clips, up to 15MB
                </p>
              </>
            )}
          </label>

          <button
            onClick={handleAnalyze}
            disabled={!file || loading}
            className="flex w-full items-center justify-center gap-2 rounded-full bg-linear-to-r from-indigo-600 to-violet-600 px-5 py-3 text-sm font-medium text-white shadow-md shadow-indigo-600/20 transition-all hover:shadow-lg hover:shadow-indigo-600/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
          >
            {loading ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Analyzing…
              </>
            ) : (
              <>
                <Sparkles className="size-4" />
                Analyze for dents
              </>
            )}
          </button>

          {error && (
            <div className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-400">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}
        </section>

        {result && (
          <section className="animate-fade-in-up flex flex-col gap-6 rounded-2xl border border-slate-200/80 bg-white/80 p-6 shadow-xs backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
            {!result.vehicleDetected && (
              <div className="flex items-start gap-2 rounded-lg bg-orange-50 px-3 py-2.5 text-sm text-orange-700 dark:bg-orange-500/10 dark:text-orange-400">
                <AlertTriangle className="mt-0.5 size-4 shrink-0" />
                <p>
                  No bus was clearly detected in this photo — results below
                  may be unreliable.
                </p>
              </div>
            )}

            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                Overall condition
              </span>
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold capitalize ${CONDITION_STYLES[result.overallCondition] ?? ""}`}
              >
                {result.overallCondition}
              </span>
            </div>

            <div>
              <h2 className="mb-3 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                Dents found ({result.dents.length})
              </h2>
              {result.dents.length === 0 ? (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2.5 text-sm text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <p>No dents detected.</p>
                </div>
              ) : (
                <ul className="flex flex-col gap-3">
                  {result.dents.map((dent, i) => (
                    <li
                      key={i}
                      className="flex flex-col gap-1.5 rounded-xl border border-slate-200 p-4 transition-colors hover:border-slate-300 dark:border-white/10 dark:hover:border-white/20"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium text-slate-800 dark:text-slate-100">
                          {dent.location}
                        </span>
                        <span
                          className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold capitalize ${SEVERITY_STYLES[dent.severity] ?? ""}`}
                        >
                          {dent.severity}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500 dark:text-slate-400">
                        {dent.description}
                      </p>
                      <p className="flex items-center gap-3 text-xs text-slate-400 dark:text-slate-500">
                        <span>Approx. size: {dent.approximateSize}</span>
                        {dent.timestamp && (
                          <span className="flex items-center gap-1">
                            <Film className="size-3" />
                            {dent.timestamp}
                          </span>
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {result.otherDamage.length > 0 && (
              <div>
                <h2 className="mb-2 text-xs font-semibold tracking-wide text-slate-400 uppercase dark:text-slate-500">
                  Other damage
                </h2>
                <ul className="flex flex-col gap-1.5">
                  {result.otherDamage.map((d, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-slate-600 dark:text-slate-400"
                    >
                      <span className="mt-1.5 size-1 shrink-0 rounded-full bg-slate-400 dark:bg-slate-500" />
                      {d}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-col gap-2 rounded-xl bg-indigo-50/60 p-4 dark:bg-indigo-500/10">
              <h2 className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-indigo-600 uppercase dark:text-indigo-400">
                <Wrench className="size-3.5" />
                Recommendation
              </h2>
              <p className="text-sm text-slate-700 dark:text-slate-300">
                {result.recommendation}
              </p>
              {result.estimatedRepairCostUsd && (
                <p className="mt-1 text-sm font-medium text-slate-800 dark:text-slate-100">
                  Estimated repair cost: $
                  {result.estimatedRepairCostUsd.low.toLocaleString()} – $
                  {result.estimatedRepairCostUsd.high.toLocaleString()}
                </p>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
