"use client";

import React from "react";
import { Search } from "lucide-react";

/** Compact labelled search box for a toolbar. The label is visually hidden but real. */
export function SearchField({
  id,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  className?: string;
}) {
  return (
    <div
      role="search"
      className={`relative flex min-w-0 flex-1 items-center ${className}`}
    >
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <Search
        className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400"
        aria-hidden="true"
      />
      <input
        id={id}
        type="search"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="enterprise-input min-h-[42px] py-2 pl-9 pr-3"
      />
    </div>
  );
}

export type SegmentOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

/** Segmented control. Buttons carry aria-pressed so the state is announced. */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: Array<SegmentOption<T>>;
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="inline-flex flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1"
    >
      {options.map((option) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.value)}
            className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 ${
              active
                ? "bg-slate-950 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-100"
            }`}
          >
            {option.label}
            {typeof option.count === "number" && (
              <span
                className={`tabular-nums ${active ? "text-teal-200" : "text-slate-400"}`}
              >
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export type DateRailDay = {
  key: string;
  label: string;
  sublabel: string;
  count?: number;
  isToday?: boolean;
};

/** Horizontal date rail: today, tomorrow, then the days after. */
export function DateRail({
  label,
  days,
  value,
  onChange,
}: {
  label: string;
  days: Array<DateRailDay>;
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div role="group" aria-label={label}>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {days.map((day) => {
          const active = day.key === value;
          return (
            <button
              key={day.key}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(day.key)}
              className={`min-w-[86px] shrink-0 rounded-xl border px-3 py-2 text-left transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 ${
                active
                  ? "border-teal-700 bg-teal-700 text-white"
                  : "border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50"
              }`}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-wide opacity-80">
                {day.label}
              </span>
              <span className="mt-0.5 block text-xs font-medium">
                {day.sublabel}
              </span>
              {typeof day.count === "number" && (
                <span
                  className={`mt-1 block text-lg font-semibold tabular-nums ${
                    active ? "text-white" : "text-slate-950"
                  }`}
                >
                  {day.count}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** Empty state that names the filter that produced it. */
export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="grid min-h-48 place-items-center rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center">
      <div>
        {icon && <div className="mb-3 text-slate-300">{icon}</div>}
        <p className="text-base font-semibold text-slate-800">{title}</p>
        <p className="mx-auto mt-1 max-w-md text-sm text-slate-500">
          {description}
        </p>
        {action && <div className="mt-4">{action}</div>}
      </div>
    </div>
  );
}

/** Politely announces how many rows survive the current filters. */
export function ResultsNote({ message }: { message: string }) {
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}
