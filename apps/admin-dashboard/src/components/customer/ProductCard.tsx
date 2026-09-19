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
    <div className="relative aspect-[4/3] bg-slate-50 overflow-hidden">
      <img
        src={image}
        alt={product.name}
        className={`h-full w-full object-cover transition-transform duration-300 ${disabled ? 'grayscale opacity-60' : ''}`}
      />
      {disabled && (
        <div className="absolute inset-0 bg-white/75 flex items-center justify-center">
          <span className="inline-flex items-center rounded-md bg-red-50 border border-red-200 px-2 py-0.5 text-[10px] font-semibold text-red-700">
            <Ban className="mr-1 h-3 w-3" /> Unavailable
          </span>
        </div>
      )}
    </div>
  );

  const title = (
    <h3 className={`text-[11px] font-semibold leading-snug line-clamp-2 min-h-[2rem] ${disabled ? 'text-slate-400' : 'text-slate-950'}`}>
      {product.name}
    </h3>
  );

  return (
    <div className={`group relative flex flex-col enterprise-card overflow-hidden ${disabled ? 'opacity-80' : ''}`}>
      {disabled ? <div className="block cursor-not-allowed" aria-disabled>{media}</div> : <Link href={`/shop/products/${product.id}`} className="block">{media}</Link>}

      <div className="flex flex-1 flex-col p-2.5">
        {disabled ? <div className="block cursor-not-allowed">{title}</div> : <Link href={`/shop/products/${product.id}`} className="block">{title}</Link>}

        {product.description ? (
          <p className="mt-0.5 min-h-[14px] text-[10px] text-slate-400 line-clamp-1">{product.description}</p>
        ) : (
          <p className="mt-0.5 min-h-[14px]" />
        )}

        {disabled && <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-wider text-red-500">Currently unavailable</p>}

        <div className="mt-auto pt-2.5">
          <div className="flex items-end justify-between gap-1.5">
            <div className="min-w-0">
              <div className={`text-sm font-semibold tabular-nums ${disabled ? 'text-slate-400' : 'text-teal-700'}`}>{formatINR(price)}</div>
              {discount > 0 ? (
                <div className="mt-0.5 flex items-center gap-1 whitespace-nowrap text-[9px]">
                  <span className="text-slate-400 line-through">{formatINR(mrp)}</span>
                  <span className="rounded-sm bg-emerald-50 px-1 py-px text-[8px] font-semibold text-emerald-700">{Math.round((discount / mrp) * 100)}% off</span>
                </div>
              ) : null}
            </div>

            <div className="flex items-center gap-1">
              <button
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); onToggleWish(); }}
                className={`grid h-7 w-7 place-items-center rounded-md border transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 ${
                  wished
                    ? 'border-rose-200 bg-rose-50 text-rose-500'
                    : 'border-slate-200 bg-white text-slate-400 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-400'
                }`}
                aria-label="Toggle wishlist"
              >
                <Heart className={`h-3.5 w-3.5 ${wished ? 'fill-current' : ''}`} />
              </button>

              {qty > 0 ? (
                <div className="inline-flex items-center rounded-md border border-slate-200 bg-white">
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onDecrement(); }}
                    className="h-7 w-7 grid place-items-center text-slate-600 hover:bg-slate-50 rounded-l-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-inset"
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-3 w-3" />
                  </button>
                  <span className="w-6 text-center text-[11px] font-semibold tabular-nums text-slate-900">{qty}</span>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); onIncrement(); }}
                    className="h-7 w-7 grid place-items-center text-slate-600 hover:bg-slate-50 rounded-r-md transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-inset"
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); if (!disabled) onAdd(); }}
                  disabled={disabled}
                  className="inline-flex items-center gap-0.5 rounded-md bg-teal-700 px-2 py-1.5 text-[10px] font-semibold text-white transition-all hover:bg-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500 focus-visible:ring-offset-1 disabled:bg-slate-300 disabled:cursor-not-allowed sm:px-3 sm:py-2 sm:text-[11px]"
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
