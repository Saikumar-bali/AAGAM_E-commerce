'use client';

import React from 'react';

type Category = { id: string; name: string; icon?: string; imageUrl?: string | null };

type CategoryRailProps = {
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export default function CategoryRail({ categories, selectedId, onSelect }: CategoryRailProps) {
  return (
    <div className="scrollbar-none -mx-1 flex gap-2 overflow-x-auto px-1 pb-3 pt-1 sm:gap-4">
      <button
        onClick={() => onSelect('')}
        className={`group flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-all sm:w-[126px] sm:gap-2 sm:rounded-3xl sm:p-3 ${
          selectedId === ''
            ? 'border-teal-700 bg-teal-700 text-white shadow-lg shadow-teal-900/20'
            : 'border-slate-100 bg-white text-slate-800 shadow-sm hover:-translate-y-1 hover:border-teal-200 hover:shadow-lg'
        }`}
      >
        <span className={`grid h-14 w-14 place-items-center rounded-xl sm:h-[84px] sm:w-[84px] sm:rounded-2xl ${selectedId === '' ? 'bg-white/15' : 'bg-gradient-to-br from-teal-50 to-emerald-100'}`}>
          <span className="grid grid-cols-2 gap-1 sm:gap-1.5" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => <span key={index} className={`h-3 w-3 rounded-[4px] sm:h-4 sm:w-4 sm:rounded-[5px] ${selectedId === '' ? 'bg-white' : 'bg-teal-700'}`} />)}
          </span>
        </span>
        <span className="min-h-8 text-[11px] font-black leading-4 sm:min-h-9 sm:text-sm">All</span>
      </button>

      {categories.map((category) => {
        const active = category.id === selectedId;
        return (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            className={`group flex w-[84px] shrink-0 flex-col items-center gap-1.5 rounded-2xl border p-2 text-center transition-all sm:w-[126px] sm:gap-2 sm:rounded-3xl sm:p-3 ${
              active
                ? 'border-teal-700 bg-teal-700 text-white shadow-lg shadow-teal-900/20'
                : 'border-slate-100 bg-white text-slate-800 shadow-sm hover:-translate-y-1 hover:border-teal-200 hover:shadow-lg'
            }`}
          >
            <span className={`relative h-14 w-14 overflow-hidden rounded-xl sm:h-[84px] sm:w-[84px] sm:rounded-2xl ${active ? 'bg-white' : 'bg-slate-50'}`}>
              {category.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={category.imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-gradient-to-br from-teal-50 to-amber-50 text-xl font-black text-teal-700 sm:text-2xl">{category.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <span className="line-clamp-2 min-h-8 text-[11px] font-black leading-4 sm:min-h-9 sm:text-sm">{category.name}</span>
          </button>
        );
      })}
    </div>
  );
}
