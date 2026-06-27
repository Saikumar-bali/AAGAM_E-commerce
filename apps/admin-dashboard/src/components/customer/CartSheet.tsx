'use client';

import React from 'react';
import { X, Minus, Plus, ShoppingBag, ArrowRight, Truck, Tag } from 'lucide-react';
import { formatINR } from '@/lib/currency';
import { getProductImage } from '@aagam/utils';
import type { CartItem } from '@/hooks/useCart';

type CartSheetProps = {
  isOpen: boolean;
  onClose: () => void;
  cart: CartItem[];
  totalItems: number;
  totalPrice: number;
  onIncrement: (id: string) => void;
  onDecrement: (id: string) => void;
  onRemove: (id: string) => void;
  onCheckout: () => void;
};

export default function CartSheet({ isOpen, onClose, cart, totalItems, totalPrice, onIncrement, onDecrement, onRemove, onCheckout }: CartSheetProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex max-w-full">
        <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right">
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-white to-teal-50/50">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-teal-100 text-teal-700">
                <ShoppingBag className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-lg font-black text-slate-950">Your Cart</h2>
                <p className="text-xs font-bold text-slate-500">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button onClick={onClose} className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors">
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-6 py-4">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="grid h-20 w-20 place-items-center rounded-full bg-gradient-to-br from-teal-50 to-amber-50 border border-teal-100">
                  <ShoppingBag className="h-9 w-9 text-teal-400" />
                </div>
                <h3 className="mt-4 text-lg font-black text-slate-950">Your cart is empty</h3>
                <p className="mt-1 text-sm text-slate-500">Add items to start shopping!</p>
                <button onClick={onClose} className="mt-5 rounded-xl bg-slate-950 px-5 py-2.5 text-sm font-black text-white hover:bg-teal-700 transition-colors">
                  Browse products
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center gap-2 rounded-xl bg-teal-50 border border-teal-100 px-3 py-2">
                  <Truck className="h-4 w-4 text-teal-700" />
                  <span className="text-xs font-bold text-teal-800">Delivery in 10 minutes</span>
                </div>

                {cart.map((item) => {
                  const image = item.image || getProductImage(item);
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 shadow-sm">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                        <img src={image} alt={item.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-black text-slate-950 truncate">{item.name}</h4>
                          <button onClick={() => onRemove(item.id)} className="shrink-0 text-slate-300 hover:text-red-500 transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-1 text-sm font-black text-teal-700">{formatINR(item.price)}</div>
                        <div className="mt-2 inline-flex items-center rounded-lg border border-teal-200 bg-teal-50">
                          <button onClick={() => onDecrement(item.id)} className="h-7 w-7 grid place-items-center hover:bg-teal-100 rounded-l-lg text-teal-800 transition-colors">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-7 text-center text-xs font-black text-teal-900">{item.quantity}</span>
                          <button onClick={() => onIncrement(item.id)} className="h-7 w-7 grid place-items-center hover:bg-teal-100 rounded-r-lg text-teal-800 transition-colors">
                            <Plus className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="border-t border-slate-100 p-6 bg-gradient-to-b from-white to-teal-50/30">
              <div className="flex items-center gap-2 rounded-xl bg-amber-50 border border-amber-200 px-3 py-2 mb-4">
                <Tag className="h-4 w-4 text-amber-600" />
                <span className="text-xs font-bold text-amber-800">Free delivery on your first order!</span>
              </div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-slate-600">Subtotal</span>
                <span className="text-xl font-black text-slate-950">{formatINR(totalPrice)}</span>
              </div>
              <button
                onClick={onCheckout}
                className="w-full flex items-center justify-center gap-2 rounded-2xl bg-teal-700 py-4 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition-all hover:bg-teal-800 hover:-translate-y-0.5"
              >
                Proceed to Checkout
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
