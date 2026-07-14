"use client";

import React from "react";
import {
  MapPin,
  Clock,
  ShoppingCart,
  Search,
  ChevronDown,
  User,
} from "lucide-react";
import Link from "next/link";

type CustomerShellProps = {
  totalItems: number;
  query: string;
  onQueryChange: (q: string) => void;
  onCartOpen: () => void;
  children: React.ReactNode;
};

export default function CustomerShell({
  totalItems,
  query,
  onQueryChange,
  onCartOpen,
  children,
}: CustomerShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50/80 via-white to-slate-50">
      <header className="sticky top-0 z-40 border-b border-teal-100/60 bg-white/90 backdrop-blur-xl shadow-[0_1px_12px_rgba(15,23,42,0.04)]">
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          <div className="flex h-16 items-center gap-2 sm:gap-4">
            <Link href="/shop" className="flex items-center gap-2.5 shrink-0">
              <span className="relative flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl bg-slate-950 text-white shadow-lg">
                <span className="absolute inset-0 bg-[radial-gradient(circle_at_25%_20%,rgba(45,212,191,0.9),transparent_32%),radial-gradient(circle_at_75%_85%,rgba(245,158,11,0.9),transparent_36%)]" />
                <span className="relative text-sm font-black">Ag</span>
              </span>
              <span className="hidden sm:block">
                <span className="block text-lg font-black tracking-tight text-slate-950 leading-none">
                  Aagam
                </span>
                <span className="block text-[9px] font-black uppercase tracking-[0.22em] text-teal-700">
                  Quick Commerce
                </span>
              </span>
            </Link>

            <button className="hidden md:flex items-center gap-2 rounded-xl border border-teal-100 bg-teal-50/80 px-3 py-2 text-xs font-bold text-teal-800 hover:bg-teal-100 transition-colors">
              <MapPin className="h-3.5 w-3.5" />
              <span>Deliver to</span>
              <span className="font-black">Home</span>
              <ChevronDown className="h-3 w-3" />
            </button>

            <button className="hidden md:flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
              <Clock className="h-3.5 w-3.5" />
              <span>
                Delivery in <span className="font-black">10 min</span>
              </span>
            </button>

            <div className="mx-1 min-w-0 flex-1 sm:mx-2 sm:max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Search groceries, essentials..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-2 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/10 sm:pl-10 sm:pr-4"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button className="hidden md:flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-teal-700 transition-colors">
                <User className="h-4.5 w-4.5" />
              </button>
              <button
                onClick={onCartOpen}
                className="relative flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-teal-700 sm:px-4"
              >
                <ShoppingCart className="h-4.5 w-4.5" />
                <span className="hidden sm:inline">Cart</span>
                {totalItems > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-[10px] font-black text-slate-950 shadow-sm">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-1 py-3 sm:px-4 sm:py-4">
        {children}
      </main>
    </div>
  );
}
