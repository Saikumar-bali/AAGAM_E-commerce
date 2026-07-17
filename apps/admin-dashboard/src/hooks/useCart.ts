'use client';

import { useEffect, useState } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

const STORAGE_KEY = 'aagam_cart';
const CART_EVENT = 'aagam:cart-changed';

function normalizeCartItem(raw: any): CartItem {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    price: Number(raw?.price ?? 0) || 0,
    quantity: Math.max(0, Number(raw?.quantity ?? 0) || 0),
    image: raw?.image ? String(raw.image) : undefined,
  };
}

function readCart(): CartItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed)
      ? parsed.map(normalizeCartItem).filter((item) => item.id && item.quantity > 0)
      : [];
  } catch {
    return [];
  }
}

function persistCart(cart: CartItem[]) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart));
  window.dispatchEvent(new CustomEvent<CartItem[]>(CART_EVENT, { detail: cart }));
}

export const useCart = () => {
  const [cart, setCart] = useState<CartItem[]>(() => readCart());
  const [isLoaded, setIsLoaded] = useState(typeof window !== 'undefined');

  useEffect(() => {
    const syncFromStorage = () => setCart(readCart());
    const syncFromApp = (event: Event) => {
      const detail = (event as CustomEvent<CartItem[]>).detail;
      setCart(Array.isArray(detail) ? detail : readCart());
    };

    setCart(readCart());
    setIsLoaded(true);
    window.addEventListener('storage', syncFromStorage);
    window.addEventListener(CART_EVENT, syncFromApp);
    return () => {
      window.removeEventListener('storage', syncFromStorage);
      window.removeEventListener(CART_EVENT, syncFromApp);
    };
  }, []);

  const commit = (updater: (current: CartItem[]) => CartItem[]) => {
    setCart((current) => {
      const next = updater(current)
        .map(normalizeCartItem)
        .filter((item) => item.id && item.quantity > 0);
      persistCart(next);
      return next;
    });
  };

  const addToCart = (product: any) => {
    commit((current) => {
      const id = String(product?.id ?? '');
      if (!id) return current;
      const existing = current.find((item) => item.id === id);
      if (existing) {
        return current.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }
      return [
        ...current,
        {
          id,
          name: String(product?.name ?? ''),
          price: Number(product?.price ?? 0) || 0,
          quantity: 1,
          image: product?.image ? String(product.image) : undefined,
        },
      ];
    });
  };

  const removeFromCart = (id: string) => {
    commit((current) => current.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    commit((current) =>
      quantity <= 0
        ? current.filter((item) => item.id !== id)
        : current.map((item) => (item.id === id ? { ...item, quantity } : item)),
    );
  };

  const clearCart = () => commit(() => []);
  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    isLoaded,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalPrice,
    totalItems,
  };
};
