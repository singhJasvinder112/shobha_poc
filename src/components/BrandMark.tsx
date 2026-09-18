"use client";

import { useState } from "react";

/**
 * Ravan.ai lockup.
 *
 * The asset is a transparent PNG whose wordmark is near-black, so it would
 * disappear against the dark header. Rather than filter it (which flattens the
 * orange mark into a white blob), dark mode sets it on a white plate — the
 * brand colours stay exact in both themes.
 *
 * Falls back to a text wordmark if the file is ever missing, so a dropped asset
 * cannot leave a broken image in front of a client.
 */
export default function BrandMark({ className = "" }: { className?: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return (
      <span
        className={`text-lg font-semibold tracking-tight text-slate-900 dark:text-white ${className}`}
      >
        Ravan<span className="text-[#ef6306]">.ai</span>
      </span>
    );
  }

  return (
    <span className="shrink-0 rounded-lg dark:bg-white dark:px-2 dark:py-1">
      {/* Explicit intrinsic size (500x175) so the header never shifts on load. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/ravan-logo.png"
        alt="Ravan.ai"
        width={500}
        height={175}
        onError={() => setFailed(true)}
        className={`h-7 w-auto ${className}`}
      />
    </span>
  );
}
