'use client';

import React from 'react';

type Category = { id: string; name: string; icon?: string };

type CategoryRailProps = {
  categories: Category[];
  selectedId: string;
  onSelect: (id: string) => void;
};

const CATEGORY_ICONS: Record<string, string> = {
  'Groceries': '🥬',
  'Electronics': '⚡',
  'Clothing': '👕',
  'Dairy': '🥛',
  'Snacks': '🍿',
  'Beverages': '🥤',
  'Fruits': '🍎',
  'Vegetables': '🥕',
  'Bakery': '🍞',
  'Meat': '🥩',
  'Frozen': '🧊',
  'Household': '🧹',
  'Personal Care': '🧴',
  'Baby Care': '👶',
  'Pet Care': '🐾',
};

export default function CategoryRail({ categories, selectedId, onSelect }: CategoryRailProps) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-none">
      <button
        onClick={() => onSelect('')}
        className={`shrink-0 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-black transition-all ${
          selectedId === ''
            ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/20'
            : 'bg-white border border-slate-100 text-slate-700 hover:border-teal-200 hover:bg-teal-50/50'
        }`}
      >
        <span className="text-lg">🏪</span>
        <span>All</span>
      </button>
      {categories.map((cat) => {
        const active = cat.id === selectedId;
        const icon = CATEGORY_ICONS[cat.name] || '📦';
        return (
          <button
            key={cat.id}
            onClick={() => onSelect(cat.id)}
            className={`shrink-0 flex flex-col items-center gap-1.5 rounded-2xl px-4 py-3 text-xs font-black transition-all ${
              active
                ? 'bg-slate-950 text-white shadow-lg shadow-slate-950/20'
                : 'bg-white border border-slate-100 text-slate-700 hover:border-teal-200 hover:bg-teal-50/50'
            }`}
          >
            <span className="text-lg">{icon}</span>
            <span className="whitespace-nowrap">{cat.name}</span>
          </button>
        );
      })}
    </div>
  );
}
