'use client';

import React from 'react';
import { LucideIcon } from 'lucide-react';

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: { label: string; onClick: () => void };
};

export default function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-teal-50 to-amber-50 border border-teal-100">
        <Icon className="h-9 w-9 text-teal-600" />
      </div>
      <h3 className="mt-5 text-lg font-black text-slate-950">{title}</h3>
      <p className="mt-2 max-w-sm text-sm font-semibold leading-6 text-slate-500">{description}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="mt-6 inline-flex items-center gap-2 rounded-2xl bg-slate-950 px-5 py-3 text-sm font-black text-white shadow-lg transition hover:-translate-y-0.5 hover:bg-teal-700"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
