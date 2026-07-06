'use client';

import React from 'react';
import Link from 'next/link';
import { Heart, Plus, Minus, Clock, Ban } from 'lucide-react';
import { formatINR } from '@/lib/currency';
import { getProductImage } from '@aagam/utils';

type ProductCardProps = {
  product: any;
  qty: number;
  onAdd: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
  wished: boolean;
  onToggleWish: () => void;
};

export default function ProductCard({ product, qty, onAdd, onIncrement, onDecrement, wished, onToggleWish }: ProductCardProps) {
  const price = typeof product.price === 'number' ? product.price : Number(product.price) || 0;
  const image = getProductImage(product);
  const hasAvailability = Boolean(product.availability);
  const inStock = product.availability?.inStock ?? true;
  const disabled = hasAvailability && !inStock;
  const categoryName = product.category?.name || 'General';

  const media = (
    <div className="relative aspect-[4/3] bg-gradient-to-br from-teal-50 to-amber-50 overflow-hidden">
      <img
        src={image}
        alt={product.name}
        className={`h-full w-full object-cover transition-transform duration-300 ${disabled ? 'grayscale opacity-60' : 'group-hover:scale-105'}`}
      />
      {disabled && (
        <div className="absolute inset-0 bg-white/75 backdrop-blur-[1px] flex items-center justify-center">
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-xs font-black text-red-700 border border-red-200">
            <Ban className="mr-1 h-3 w-3" /> Unavailable
          </span>
        </div>
      )}
      <div className="absolute top-2 left-2 rounded-lg bg-white/90 backdrop-blur-sm border border-slate-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-teal-800">
        {categoryName}
      </div>
      <div className="absolute top-2 right-2 flex items-center gap-1 rounded-lg bg-white/90 backdrop-blur-sm border border-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
        <Clock className="h-2.5 w-2.5" />
        10 min
      </div>
    </div>
  );

  const title = (
    <h3 className={`text-[13px] font-extrabold leading-snug line-clamp-2 min-h-[2.5rem] ${disabled ? 'text-slate-400' : 'text-slate-950'}`}>
      {product.name}
    </h3>
  );

  return (
    <div className={`group relative flex flex-col rounded-2xl border border-slate-100 bg-white shadow-[0_2px_12px_rgba(15,23,42,0.04)] overflow-hidden transition-all ${disabled ? 'opacity-80' : 'hover:shadow-[0_8px_30px_rgba(15,23,42,0.08)] hover:-translate-y-0.5'}`}>
      {disabled ? <div className="block cursor-not-allowed" aria-disabled>{media}</div> : <Link href={`/shop/products/${product.id}`} className="block">{media}</Link>}

      <div className="flex flex-1 flex-col p-3">
        {disabled ? <div className="block cursor-not-allowed">{title}</div> : <Link href={`/shop/products/${product.id}`} className="block">{title}</Link>}

        {product.description && (
          <p className="mt-1 text-[11px] font-semibold text-slate-400 line-clamp-1">{product.description}</p>
        )}

        {disabled && <p className="mt-2 text-[11px] font-black uppercase tracking-wider text-red-500">Currently unavailable</p>}

        <div className="mt-auto pt-3 flex items-end justify-between gap-2">
          <div>
            <div className={`text-base font-black ${disabled ? 'text-slate-400' : 'text-slate-950'}`}>{formatINR(price)}</div>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWish(); }}
              className={`grid h-8 w-8 place-items-center rounded-lg border transition-all ${
                wished
                  ? 'border-rose-200 bg-rose-50 text-rose-500'
                  : 'border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-400'
              }`}
              aria-label="Toggle wishlist"
            >
              <Heart className={`h-3.5 w-3.5 ${wished ? 'fill-current' : ''}`} />
            </button>

            {qty > 0 ? (
              <div className="inline-flex items-center rounded-xl border border-teal-200 bg-teal-50">
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDecrement(); }}
                  className="h-8 w-8 grid place-items-center text-teal-800 hover:bg-teal-100 rounded-l-xl transition-colors"
                  aria-label="Decrease quantity"
                >
                  <Minus className="h-3.5 w-3.5" />
                </button>
                <span className="w-7 text-center text-xs font-black text-teal-900">{qty}</span>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); onIncrement(); }}
                  className="h-8 w-8 grid place-items-center text-teal-800 hover:bg-teal-100 rounded-r-xl transition-colors"
                  aria-label="Increase quantity"
                >
                  <Plus className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) onAdd(); }}
                disabled={disabled}
                className="inline-flex items-center gap-1 rounded-xl bg-teal-700 px-3.5 py-2 text-xs font-black text-white shadow-sm transition-all hover:bg-teal-800 hover:shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed"
              >
                <Plus className="h-3 w-3" />
                {disabled ? 'N/A' : 'ADD'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
