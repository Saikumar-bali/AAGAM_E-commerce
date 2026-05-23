'use client';

import { useEffect, useMemo, useState } from 'react';

export interface WishlistItem {
  id: string;
  name: string;
  price: number;
  image?: string;
}

const KEY = 'aagam_wishlist';

export const useWishlist = () => {
  const [items, setItems] = useState<WishlistItem[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) setItems(parsed);
      }
    } catch {
      setItems([]);
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(KEY, JSON.stringify(items));
  }, [items, loaded]);

  const has = (id: string) => items.some((i) => i.id === id);

  const toggle = (item: WishlistItem) => {
    setItems((prev) => (prev.some((i) => i.id === item.id) ? prev.filter((i) => i.id !== item.id) : [item, ...prev]));
  };

  const remove = (id: string) => setItems((prev) => prev.filter((i) => i.id !== id));
  const clear = () => setItems([]);

  const count = useMemo(() => items.length, [items.length]);

  return { items, has, toggle, remove, clear, count };
};

