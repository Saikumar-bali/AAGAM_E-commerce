'use client';

import React, { useEffect, useState } from 'react';
import { X, ArrowRightLeft, Package } from 'lucide-react';
import { apiClient, getProductImage } from '@aagam/utils';
import { formatINR } from '@/lib/currency';

type Substitute = {
  id: string;
  name: string;
  price: number;
  image?: string | null;
  category?: { name?: string | null } | null;
  inStock: boolean;
  availableQty: number | null;
};

type Props = {
  productId: string;
  storeId: string | null;
  isOpen: boolean;
  onClose: () => void;
  onReplace: (oldProductId: string, newProduct: Substitute) => void;
};

export default function SubstituteSheet({ productId, storeId, isOpen, onClose, onReplace }: Props) {
  const [substitutes, setSubstitutes] = useState<Substitute[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen || !productId) return;
    setLoading(true);
    const params: any = {};
    if (storeId) params.storeId = storeId;
    apiClient.get(`/products/${productId}/substitutes`, { params })
      .then((res) => setSubstitutes(Array.isArray(res.data) ? res.data : []))
      .catch(() => setSubstitutes([]))
      .finally(() => setLoading(false));
  }, [isOpen, productId, storeId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 max-h-[70vh] rounded-t-3xl bg-white shadow-2xl flex flex-col">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-amber-100 text-amber-700">
              <ArrowRightLeft className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-950">Substitute Suggestions</h2>
              <p className="text-xs font-bold text-slate-500">Same category, in stock</p>
            </div>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-20 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : substitutes.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 text-center">
              <div className="grid h-16 w-16 place-items-center rounded-full bg-slate-100">
                <Package className="h-7 w-7 text-slate-400" />
              </div>
              <p className="mt-3 text-sm font-bold text-slate-500">No substitutes available in this category</p>
            </div>
          ) : (
            <div className="space-y-3">
              {substitutes.map((sub) => (
                <button
                  key={sub.id}
                  onClick={() => onReplace(productId, sub)}
                  className="w-full flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3 text-left hover:border-teal-200 hover:bg-teal-50/30 transition-all"
                >
                  <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                    <img src={getProductImage(sub)} alt={sub.name} className="h-full w-full object-cover" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black text-slate-950 truncate">{sub.name}</div>
                    <div className="text-xs font-bold text-slate-500">{sub.category?.name || 'Same category'}</div>
                    <div className="text-sm font-black text-teal-700 mt-0.5">{formatINR(sub.price)}</div>
                  </div>
                  <div className="shrink-0 rounded-xl bg-teal-700 px-3 py-1.5 text-xs font-black text-white">
                    Replace
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
