'use client';

import React from 'react';
import { formatINR } from '@/lib/currency';
import { Truck, ShieldCheck, Tag, Receipt } from 'lucide-react';

type BillItem = {
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type BillDetailsCardProps = {
  items: BillItem[];
  subtotal: number;
  deliveryFee: number;
  discountAmount?: number;
  taxAmount?: number;
  grandTotal: number;
  storeName?: string | null;
  distanceKm?: number | null;
  loading?: boolean;
};

export default function BillDetailsCard({
  items,
  subtotal,
  deliveryFee,
  discountAmount = 0,
  taxAmount = 0,
  grandTotal,
  storeName,
  distanceKm,
  loading,
}: BillDetailsCardProps) {
  if (loading) {
    return (
      <div className="rounded-2xl border border-slate-100 bg-white p-5">
        <div className="h-5 w-32 animate-pulse rounded-lg bg-slate-100" />
        <div className="mt-4 space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex justify-between">
              <div className="h-4 w-24 animate-pulse rounded bg-slate-100" />
              <div className="h-4 w-16 animate-pulse rounded bg-slate-100" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-slate-100 bg-white overflow-hidden">
      <div className="bg-gradient-to-r from-slate-950 to-slate-800 px-5 py-4">
        <div className="flex items-center gap-2 text-white">
          <Receipt className="h-4 w-4" />
          <span className="text-sm font-black">Bill Details</span>
        </div>
      </div>

      <div className="p-5">
        {storeName && (
          <div className="flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-100 px-3 py-2 mb-4">
            <span className="text-xs font-bold text-teal-800">
              {storeName} {distanceKm != null && `• ${distanceKm.toFixed(1)} km`}
            </span>
          </div>
        )}

        <div className="space-y-2.5">
          {items.map((it, i) => (
            <div key={i} className="flex items-start justify-between gap-3 text-sm">
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800 truncate">{it.name}</div>
                <div className="text-xs text-slate-400 mt-0.5">{it.quantity} × {formatINR(it.unitPrice)}</div>
              </div>
              <div className="font-black text-slate-950 shrink-0">{formatINR(it.lineTotal)}</div>
            </div>
          ))}
        </div>

        <div className="my-4 border-t border-dashed border-slate-200" />

        <div className="space-y-2 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-slate-500 font-semibold">Subtotal</span>
            <span className="font-black text-slate-950">{formatINR(subtotal)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-500 font-semibold">
              <Truck className="h-3.5 w-3.5" />
              Delivery fee
            </span>
            <span className={`font-black ${deliveryFee === 0 ? 'text-teal-600' : 'text-slate-950'}`}>
              {deliveryFee === 0 ? 'FREE' : formatINR(deliveryFee)}
            </span>
          </div>
          {discountAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-teal-600 font-semibold">
                <Tag className="h-3.5 w-3.5" />
                Discount
              </span>
              <span className="font-black text-teal-600">-{formatINR(discountAmount)}</span>
            </div>
          )}
          {taxAmount > 0 && (
            <div className="flex items-center justify-between">
              <span className="text-slate-500 font-semibold">Tax</span>
              <span className="font-black text-slate-950">{formatINR(taxAmount)}</span>
            </div>
          )}
        </div>

        <div className="my-3 border-t border-slate-200" />

        <div className="flex items-center justify-between rounded-xl bg-slate-950 px-4 py-3">
          <span className="flex items-center gap-2 text-sm font-black text-white">
            <ShieldCheck className="h-4 w-4 text-teal-400" />
            Grand Total
          </span>
          <span className="text-xl font-black text-white">{formatINR(grandTotal)}</span>
        </div>
      </div>
    </div>
  );
}
