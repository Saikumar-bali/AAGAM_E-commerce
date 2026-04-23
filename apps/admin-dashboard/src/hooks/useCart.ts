'use client';

import { useState, useEffect } from 'react';

export interface CartItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
  image?: string;
}

function normalizeCartItem(raw: any): CartItem {
  return {
    id: String(raw?.id ?? ''),
    name: String(raw?.name ?? ''),
    price: Number(raw?.price ?? 0) || 0,
    quantity: Number(raw?.quantity ?? 0) || 0,
    image: raw?.image ? String(raw.image) : undefined,
  };
}

export const useCart = () => {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    const savedCart = localStorage.getItem('aagam_cart');
    if (savedCart) {
      try {
        const parsed = JSON.parse(savedCart);
        const next = Array.isArray(parsed) ? parsed.map(normalizeCartItem).filter((i) => i.id && i.quantity > 0) : [];
        setCart(next);
      } catch {
        setCart([]);
      }
    }
    setIsLoaded(true);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      localStorage.setItem('aagam_cart', JSON.stringify(cart));
    }
  }, [cart, isLoaded]);

  const addToCart = (product: any) => {
    setCart((prev) => {
      const id = String(product?.id ?? '');
      if (!id) return prev;

      const candidate: Omit<CartItem, 'quantity'> = {
        id,
        name: String(product?.name ?? ''),
        price: Number(product?.price ?? 0) || 0,
        image: product?.image ? String(product.image) : undefined,
      };

      const existing = prev.find((item) => item.id === id);
      if (existing) {
        return prev.map((item) =>
          item.id === id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { ...candidate, quantity: 1 }];
    });
  };

  const removeFromCart = (id: string) => {
    setCart((prev) => prev.filter((item) => item.id !== id));
  };

  const updateQuantity = (id: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(id);
      return;
    }
    setCart((prev) =>
      prev.map((item) => (item.id === id ? { ...item, quantity } : item))
    );
  };

  const clearCart = () => setCart([]);

  const totalPrice = cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const totalItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  return {
    cart,
    addToCart,
    removeFromCart,
    updateQuantity,
    clearCart,
    totalPrice,
    totalItems,
  };
};
