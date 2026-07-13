"use client";

import React from "react";
import Link from "next/link";
import { ArrowLeft, Loader2, RefreshCw } from "lucide-react";
import { apiClient } from "@aagam/utils";

export function moneyPaise(value?: number | null) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(Number(value || 0) / 100);
}

export function RiderPageHeader({
  title,
  subtitle,
  backHref,
  action,
}: {
  title: string;
  subtitle: string;
  backHref?: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="flex flex-col gap-4 rounded-[2rem] bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 p-6 text-white shadow-xl sm:flex-row sm:items-center sm:justify-between">
      <div>
        {backHref && (
          <Link
            href={backHref}
            className="mb-3 inline-flex items-center gap-2 text-xs font-black uppercase tracking-wider text-emerald-300"
          >
            <ArrowLeft className="h-4 w-4" />
            Rider home
          </Link>
        )}
        <p className="text-xs font-black uppercase tracking-[0.22em] text-emerald-300">
          Rider operations
        </p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">{title}</h1>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-300">
          {subtitle}
        </p>
      </div>
      {action}
    </header>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone = "slate",
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: "slate" | "emerald" | "amber" | "indigo" | "red";
}) {
  const colors = {
    slate: "text-slate-950",
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    indigo: "text-indigo-700",
    red: "text-red-700",
  };
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <p className="text-xs font-black uppercase tracking-wider text-slate-400">
        {label}
      </p>
      <p className={`mt-2 text-3xl font-black ${colors[tone]}`}>{value}</p>
      {hint && (
        <p className="mt-1 text-xs font-semibold text-slate-500">{hint}</p>
      )}
    </div>
  );
}

export function PortalLoading() {
  return (
    <div className="flex min-h-56 items-center justify-center rounded-2xl border border-slate-200 bg-white">
      <Loader2 className="h-7 w-7 animate-spin text-emerald-600" />
    </div>
  );
}

export function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
      <p className="text-lg font-black text-slate-900">{title}</p>
      <p className="mt-2 text-sm font-semibold text-slate-500">{body}</p>
    </div>
  );
}

export function RefreshButton({
  onClick,
  loading,
}: {
  onClick: () => void;
  loading?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2.5 text-sm font-black text-white hover:bg-white/20 disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      Refresh
    </button>
  );
}

export function ErrorBanner({ message }: { message?: string }) {
  return message ? (
    <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">
      {message}
    </div>
  ) : null;
}

export function PrivateEvidenceLink({
  storageKey,
  label = "Open evidence",
}: {
  storageKey: string;
  label?: string;
}) {
  const [loading, setLoading] = React.useState(false);
  const open = async () => {
    setLoading(true);
    try {
      const response = await apiClient.get(
        `/upload/evidence-url?key=${encodeURIComponent(storageKey)}`
      );
      window.open(response.data.url, "_blank", "noopener,noreferrer");
    } finally {
      setLoading(false);
    }
  };
  return (
    <button
      type="button"
      onClick={open}
      disabled={loading}
      className="text-xs font-black text-indigo-700 underline disabled:opacity-50"
    >
      {loading ? "Opening…" : label}
    </button>
  );
}
