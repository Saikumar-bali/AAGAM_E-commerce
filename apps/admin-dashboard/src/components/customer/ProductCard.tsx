'use client';

import React from 'react';
import Link from 'next/link';
import { Heart, Plus, Minus, Ban } from 'lucide-react';
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
  const mrp = Math.max(Number(product.mrpPaise || 0) / 100, price);
  const discount = Math.max(0, mrp - price);

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

        {product.description ? (
          <p className="mt-1 min-h-[14px] text-[11px] font-semibold text-slate-400 line-clamp-1">{product.description}</p>
        ) : (
          <p className="mt-1 min-h-[14px]" />
        )}

        {disabled && <p className="mt-2 text-[11px] font-black uppercase tracking-wider text-red-500">Currently unavailable</p>}

        <div className="mt-auto pt-3">
          <div className="flex items-end justify-between gap-1.5">
            <div className="min-w-0">
              <div className={`inline-flex rounded-xl px-2 py-1 text-sm font-black sm:text-base ${disabled ? 'bg-slate-100 text-slate-400' : 'bg-emerald-700 text-white'}`}>{formatINR(price)}</div>
              {discount > 0 ? (
                <div className="mt-1 flex items-center gap-1 whitespace-nowrap text-[9px] font-bold sm:text-[10px]">
                  <span className="text-slate-400 line-through">{formatINR(mrp)}</span>
                  <span className="rounded bg-emerald-50 px-1 py-px text-[8px] font-black text-emerald-700 sm:text-[9px]">{Math.round((discount / mrp) * 100)}% off</span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-1 sm:gap-1.5">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWish(); }}
                className={`grid h-7 w-7 place-items-center rounded-lg border transition-all sm:h-8 sm:w-8 ${
                  wished
                    ? 'border-rose-200 bg-rose-50 text-rose-500'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-400'
                }`}
                aria-label="Toggle wishlist"
              >
                <Heart className={`h-3 w-3 sm:h-3.5 sm:w-3.5 ${wished ? 'fill-current' : ''}`} />
              </button>

              {qty > 0 ? (
                <div className="inline-flex items-center rounded-xl border border-teal-200 bg-teal-50">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDecrement(); }}
                    className="h-7 w-7 grid place-items-center text-teal-800 hover:bg-teal-100 rounded-l-xl transition-colors sm:h-8 sm:w-8"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </button>
                  <span className="w-5 text-center text-[10px] font-black text-teal-900 sm:w-7 sm:text-xs">{qty}</span>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onIncrement(); }}
                    className="h-7 w-7 grid place-items-center text-teal-800 hover:bg-teal-100 rounded-r-xl transition-colors sm:h-8 sm:w-8"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) onAdd(); }}
                  disabled={disabled}
                  className="inline-flex items-center gap-0.5 rounded-xl bg-teal-700 px-2.5 py-1.5 text-[10px] font-black text-white shadow-sm transition-all hover:bg-teal-800 hover:shadow-md disabled:bg-slate-300 disabled:cursor-not-allowed sm:gap-1 sm:px-3.5 sm:py-2 sm:text-xs"
                >
                  <Plus className="h-3 w-3" />
                  {disabled ? 'N/A' : 'ADD'}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
