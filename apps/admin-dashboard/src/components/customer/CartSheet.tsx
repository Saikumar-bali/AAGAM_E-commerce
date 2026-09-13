'use client';

import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Minus, Plus, ShoppingBag, Truck } from 'lucide-react';
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
  onClear?: () => void;
  onCheckout?: () => void;
};

export default function CartSheet({
  isOpen,
  onClose,
  cart,
  totalItems,
  totalPrice,
  onIncrement,
  onDecrement,
  onRemove,
  onClear,
  onCheckout,
}: CartSheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    // Move focus into the sheet so desktop users cannot tab through the page
    // controls behind the overlay while the cart is open.
    panelRef.current?.querySelector<HTMLElement>('button')?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      // Trap Tab and Shift+Tab within the sheet.
      if (e.key !== 'Tab' || !panelRef.current) return;
      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'),
      ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true');
      if (focusables.length === 0) {
        e.preventDefault();
        return;
      }
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div className="absolute inset-0 bg-slate-950/40 backdrop-blur-sm transition-opacity" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex max-w-full" role="dialog" aria-modal="true" aria-label="Shopping cart">
        <div ref={panelRef} className="w-screen max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
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
            <button onClick={onClose} aria-label="Close cart" className="grid h-9 w-9 place-items-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors">
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
                  <span className="text-xs font-bold text-teal-800">Fast doorstep delivery</span>
                </div>

                {cart.map((item) => {
                  const image = item.image || getProductImage(item);
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-2xl border border-slate-100 bg-white p-3.5 shadow-xs">
                      <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-slate-50">
                        <img src={image} alt={item.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-bold text-slate-900 truncate">{item.name}</h4>
                          <button onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`} className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors">
                            <X className="h-4 w-4" />
                          </button>
                        </div>
                        <div className="mt-1 text-sm font-extrabold text-teal-800">{formatINR(item.price)}</div>
                        <div className="mt-2.5 inline-flex items-center rounded-xl border border-teal-200 bg-teal-50 shadow-2xs">
                          <button onClick={() => onDecrement(item.id)} aria-label="Decrease quantity" className="h-7 w-7 grid place-items-center hover:bg-teal-100 rounded-l-xl text-teal-800 transition-colors">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-xs font-black text-teal-900 tabular-nums">{item.quantity}</span>
                          <button onClick={() => onIncrement(item.id)} aria-label="Increase quantity" className="h-7 w-7 grid place-items-center hover:bg-teal-100 rounded-r-xl text-teal-800 transition-colors">
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
            <div className="border-t border-slate-100 bg-white p-5 space-y-3 shadow-lg">
              <div className="flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-500">Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'items'})</span>
                <span className="text-lg font-black text-slate-950 tabular-nums">{formatINR(totalPrice)}</span>
              </div>
              <div className="flex items-center gap-2">
                {onClear && (
                  <button
                    onClick={onClear}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-xs font-bold text-slate-600 transition hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={onCheckout || onClose}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-teal-800 py-3.5 text-sm font-extrabold text-white shadow-lg shadow-teal-950/15 transition hover:bg-teal-900"
                >
                  <span>Proceed to Checkout</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
