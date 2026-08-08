"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import { Bell, ChevronDown, MapPin, Search, ShoppingCart, User } from "lucide-react";

type CustomerShellProps = {
  totalItems: number;
  query: string;
  onQueryChange: (q: string) => void;
  onCartOpen: () => void;
  children: React.ReactNode;
};

export default function CustomerShell({ totalItems, query, onQueryChange, onCartOpen, children }: CustomerShellProps) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-teal-50/80 via-white to-slate-50">
      <header className="sticky top-0 z-40 border-b border-teal-100/60 bg-white/95 shadow-[0_1px_12px_rgba(15,23,42,0.04)] backdrop-blur-xl">
        <div className="mx-auto max-w-7xl px-2 sm:px-4">
          <div className="flex h-16 items-center gap-2 sm:gap-4">
            <Link href="/shop" className="flex shrink-0 items-center gap-2 sm:gap-2.5" aria-label="Aagaam shop home">
              <span className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl border border-slate-100 bg-white p-0.5 shadow-md">
                <Image src="/brand/aagam-mark" width={80} height={80} alt="Aagaam" className="h-full w-full object-contain" priority unoptimized />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-black leading-none tracking-tight text-slate-950 sm:text-lg">Aagaam</span>
                <span className="mt-0.5 hidden text-[9px] font-bold uppercase tracking-[0.15em] text-teal-700 sm:block">fresh, quality and trust</span>
              </span>
            </Link>

            <Link href="/shop/addresses" className="hidden items-center gap-2 rounded-xl border border-teal-100 bg-teal-50/80 px-3 py-2 text-xs font-bold text-teal-800 transition-colors hover:bg-teal-100 md:flex">
              <MapPin className="h-3.5 w-3.5" />
              <span>Delivery address</span>
              <ChevronDown className="h-3 w-3" />
            </Link>

            <div className="mx-1 min-w-0 flex-1 sm:mx-2 sm:max-w-xl">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(event) => onQueryChange(event.target.value)}
                  placeholder="Search groceries, essentials..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50/80 py-2.5 pl-9 pr-2 text-sm font-semibold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-400 focus:bg-white focus:ring-4 focus:ring-teal-500/10 sm:pl-10 sm:pr-4"
                />
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2">
              <Link href="/shop/account" aria-label="Open account" className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 transition-colors hover:border-teal-200 hover:text-teal-700 md:flex">
                <User className="h-[18px] w-[18px]" />
              </Link>
              <Link href="/shop/notifications" aria-label="Open notifications" className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:text-teal-700">
                <Bell className="h-[18px] w-[18px]" />
              </Link>
              <button onClick={onCartOpen} aria-label={`Open cart with ${totalItems} items`} className="relative flex h-10 items-center gap-2 rounded-xl bg-slate-950 px-3 text-sm font-black text-white shadow-lg shadow-slate-950/15 transition hover:-translate-y-0.5 hover:bg-teal-700 sm:px-4">
                <ShoppingCart className="h-[18px] w-[18px]" />
                <span className="hidden sm:inline">Cart</span>
                {totalItems > 0 && <span className="absolute -right-1.5 -top-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-950 shadow-sm">{totalItems > 99 ? '99+' : totalItems}</span>}
              </button>
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-1 py-3 sm:px-4 sm:py-4">{children}</main>
    </div>
  );
}
