"use client";

import React from "react";

/** Page title block: kicker, heading, one line of context, and right-side actions. */
export function PageHeader({
  kicker,
  title,
  description,
  actions,
}: {
  kicker: string;
  title: string;
  description: string;
  actions?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <p className="enterprise-kicker">{kicker}</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-[-0.02em] text-slate-950 md:text-3xl">
          {title}
        </h1>
        <p className="mt-1.5 max-w-2xl text-sm text-slate-500">{description}</p>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

export type KpiTile = {
  id: string;
  label: string;
  value: string | number;
  note?: string;
  tone?: "slate" | "teal" | "amber" | "emerald" | "red" | "blue" | "purple";
  active?: boolean;
  disabled?: boolean;
};

const toneText: Record<string, string> = {
  slate: "text-slate-950",
  teal: "text-teal-700",
  amber: "text-amber-700",
  emerald: "text-emerald-700",
  red: "text-red-600",
  blue: "text-blue-700",
  purple: "text-purple-700",
};

/**
 * KPI strip. Every tile is a real button: the count and the filter live in the
 * same control, so a number you can read is also a number you can act on.
 */
export function KpiStrip({
  label,
  tiles,
  onSelect,
  columns = 5,
}: {
  label: string;
  tiles: Array<KpiTile>;
  onSelect?: (id: string) => void;
  columns?: 5 | 6;
}) {
  return (
    <div
      role={onSelect ? "group" : undefined}
      aria-label={onSelect ? label : undefined}
      className={`grid grid-cols-2 gap-2 sm:grid-cols-3 ${
        columns === 6 ? "lg:grid-cols-6" : "lg:grid-cols-5"
      }`}
    >
      {tiles.map((tile) => {
        const body = (
          <>
            <span className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-slate-500">
              {tile.label}
            </span>
            <span
              className={`mt-1 block text-2xl font-semibold tabular-nums ${
                tile.tone ? toneText[tile.tone] : "text-slate-950"
              }`}
            >
              {tile.value}
            </span>
            {tile.note && (
              <span className="mt-0.5 block truncate text-[11px] text-slate-500">
                {tile.note}
              </span>
            )}
          </>
        );

        if (!onSelect) {
          return (
            <div
              key={tile.id}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2.5"
            >
              {body}
            </div>
          );
        }

        const active = Boolean(tile.active);
        return (
          <button
            key={tile.id}
            type="button"
            aria-pressed={active}
            disabled={tile.disabled}
            onClick={() => onSelect(tile.id)}
            className={`rounded-xl border px-3 py-2.5 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 ${
              active
                ? "border-teal-700 bg-teal-50 shadow-sm"
                : "border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/40"
            }`}
          >
            {body}
          </button>
        );
      })}
    </div>
  );
}

/** Shared refresh control with a stable label while it works. */
export function RefreshButton({
  onClick,
  busy,
  label = "Refresh",
}: {
  onClick: () => void;
  busy: boolean;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className="inline-flex min-h-[42px] items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-2 disabled:opacity-60"
    >
      <svg
        className={`h-4 w-4 ${busy ? "animate-spin" : ""}`}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
        />
      </svg>
      {label}
    </button>
  );
}
