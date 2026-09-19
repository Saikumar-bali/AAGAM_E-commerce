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
      <div className="absolute inset-0 bg-slate-950/40 transition-opacity" onClick={onClose} />
      <div className="absolute inset-y-0 right-0 flex max-w-full" role="dialog" aria-modal="true" aria-label="Shopping cart">
        <div ref={panelRef} className="w-screen max-w-md bg-white shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
          <div className="px-4 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
            <div className="flex items-center gap-2.5">
              <div className="grid h-9 w-9 place-items-center rounded-md bg-teal-50 text-teal-700">
                <ShoppingBag className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-950">Your cart</h2>
                <p className="text-[11px] text-slate-500">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
              </div>
            </div>
            <button onClick={onClose} aria-label="Close cart" className="grid h-8 w-8 place-items-center rounded-md border border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-slate-700 transition-colors">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3">
            {cart.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center text-center">
                <div className="grid h-16 w-16 place-items-center rounded-lg bg-slate-50 border border-slate-100">
                  <ShoppingBag className="h-7 w-7 text-slate-300" />
                </div>
                <h3 className="mt-3 text-base font-semibold text-slate-950">Your cart is empty</h3>
                <p className="mt-1 text-xs text-slate-500">Add items to start shopping.</p>
                <button onClick={onClose} className="mt-4 enterprise-button">
                  Browse products
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 rounded-md bg-teal-50 border border-teal-100 px-2.5 py-1.5">
                  <Truck className="h-3.5 w-3.5 text-teal-700" />
                  <span className="text-[11px] font-medium text-teal-800">Fast doorstep delivery</span>
                </div>

                {cart.map((item) => {
                  const image = item.image || getProductImage(item);
                  return (
                    <div key={item.id} className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-white p-3">
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border border-slate-100 bg-slate-50">
                        <img src={image} alt={item.name} className="h-full w-full object-cover" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <h4 className="text-sm font-medium text-slate-900 truncate">{item.name}</h4>
                          <button onClick={() => onRemove(item.id)} aria-label={`Remove ${item.name}`} className="shrink-0 p-1 text-slate-300 hover:text-red-500 transition-colors">
                            <X className="h-3.5 w-3.5" />
                          </button>
                        </div>
                        <div className="mt-0.5 text-sm font-semibold text-teal-700">{formatINR(item.price)}</div>
                        <div className="mt-2 inline-flex items-center rounded-md border border-slate-200 bg-white">
                          <button onClick={() => onDecrement(item.id)} aria-label="Decrease quantity" className="h-7 w-7 grid place-items-center hover:bg-slate-50 rounded-l-md text-slate-600 transition-colors">
                            <Minus className="h-3 w-3" />
                          </button>
                          <span className="w-8 text-center text-xs font-semibold text-slate-900 tabular-nums">{item.quantity}</span>
                          <button onClick={() => onIncrement(item.id)} aria-label="Increase quantity" className="h-7 w-7 grid place-items-center hover:bg-slate-50 rounded-r-md text-slate-600 transition-colors">
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
            <div className="border-t border-slate-100 bg-white p-4 space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-slate-500">Subtotal ({totalItems} {totalItems === 1 ? 'item' : 'items'})</span>
                <span className="text-base font-semibold tabular-nums text-slate-950">{formatINR(totalPrice)}</span>
              </div>
              <div className="flex items-center gap-2">
                {onClear && (
                  <button
                    onClick={onClear}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-medium text-slate-600 transition hover:bg-red-50 hover:border-red-200 hover:text-red-600"
                  >
                    Clear
                  </button>
                )}
                <button
                  onClick={onCheckout || onClose}
                  className="enterprise-button flex flex-1 items-center justify-center gap-2 py-2.5"
                >
                  <span>Proceed to checkout</span>
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
