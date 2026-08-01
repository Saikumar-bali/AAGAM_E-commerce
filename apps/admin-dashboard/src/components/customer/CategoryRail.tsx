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
    <div className="scrollbar-none -mx-1 flex gap-3 overflow-x-auto px-1 pb-3 pt-1 sm:gap-4">
      <button
        onClick={() => onSelect('')}
        className={`group flex w-[112px] shrink-0 flex-col items-center gap-2 rounded-3xl border p-3 text-center transition-all sm:w-[126px] ${
          selectedId === ''
            ? 'border-teal-700 bg-teal-700 text-white shadow-lg shadow-teal-900/20'
            : 'border-slate-100 bg-white text-slate-800 shadow-sm hover:-translate-y-1 hover:border-teal-200 hover:shadow-lg'
        }`}
      >
        <span className={`grid h-[74px] w-[74px] place-items-center rounded-2xl sm:h-[84px] sm:w-[84px] ${selectedId === '' ? 'bg-white/15' : 'bg-gradient-to-br from-teal-50 to-emerald-100'}`}>
          <span className="grid grid-cols-2 gap-1.5" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, index) => <span key={index} className={`h-4 w-4 rounded-[5px] ${selectedId === '' ? 'bg-white' : 'bg-teal-700'}`} />)}
          </span>
        </span>
        <span className="min-h-9 text-xs font-black leading-4 sm:text-sm">All</span>
      </button>

      {categories.map((category) => {
        const active = category.id === selectedId;
        return (
          <button
            key={category.id}
            onClick={() => onSelect(category.id)}
            className={`group flex w-[112px] shrink-0 flex-col items-center gap-2 rounded-3xl border p-3 text-center transition-all sm:w-[126px] ${
              active
                ? 'border-teal-700 bg-teal-700 text-white shadow-lg shadow-teal-900/20'
                : 'border-slate-100 bg-white text-slate-800 shadow-sm hover:-translate-y-1 hover:border-teal-200 hover:shadow-lg'
            }`}
          >
            <span className={`relative h-[74px] w-[74px] overflow-hidden rounded-2xl sm:h-[84px] sm:w-[84px] ${active ? 'bg-white' : 'bg-slate-50'}`}>
              {category.imageUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={category.imageUrl} alt="" className="h-full w-full object-cover transition duration-300 group-hover:scale-105" />
              ) : (
                <span className="grid h-full w-full place-items-center bg-gradient-to-br from-teal-50 to-amber-50 text-2xl font-black text-teal-700">{category.name.charAt(0).toUpperCase()}</span>
              )}
            </span>
            <span className="line-clamp-2 min-h-9 text-xs font-black leading-4 sm:text-sm">{category.name}</span>
          </button>
        );
      })}
    </div>
  );
}
