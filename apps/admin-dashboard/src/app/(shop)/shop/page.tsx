'use client';

import React, { useMemo, useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import DashboardLayout from '@/components/DashboardLayout';
import CustomerShell from '@/components/customer/CustomerShell';
import CategoryRail from '@/components/customer/CategoryRail';
import OfferBanner from '@/components/customer/OfferBanner';
import PromotionHeroCarousel from '@/components/customer/PromotionHeroCarousel';
import type { PromotionPlacements } from '@/components/customer/promotion-types';
import ProductCard from '@/components/customer/ProductCard';
import CartSheet from '@/components/customer/CartSheet';
import EmptyState from '@/components/customer/EmptyState';
import { Package, SlidersHorizontal, ArrowRight } from 'lucide-react';

const EMPTY_PLACEMENTS: PromotionPlacements = { HOME_HERO: [], HOME_TODAY_OFFERS: [], DEALS_PAGE: [] };

function isUnavailable(product: any) {
  return Boolean(product.availability) && product.availability?.inStock === false;
}

function getCategoryId(product: any) {
  return product.categoryId || product.category?.id || 'uncategorized';
}

function getCategoryName(product: any) {
  return product.category?.name || 'Other Products';
}

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [sort, setSort] = useState('newest');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [promotions, setPromotions] = useState<PromotionPlacements>(EMPTY_PLACEMENTS);
  const { cart, addToCart, updateQuantity, removeFromCart, totalPrice, totalItems } = useCart();
  const wishlist = useWishlist();
  const router = useRouter();

useEffect(() => {
    const category =
      new URLSearchParams(window.location.search).get("category") || "";
    setSelectedCategoryId(category);
    apiClient
      .get("/promotions/active")
      .then((response) =>
        setPromotions({
          ...EMPTY_PLACEMENTS,
          ...(response.data?.placements || {}),
        })
      )
      .catch((error) =>
        console.error("Failed to load active promotions", error)
      );
  }, []);

  useEffect(() => {
    const fetchProducts = async () => {
      setLoading(true);
      try {
        const [productsResponse, categoriesResponse] = await Promise.all([
          apiClient.get('/products', {
            params: {
              search: query || undefined,
              categoryId: selectedCategoryId || undefined,
              sort,
            },
          }),
          apiClient.get('/products/categories'),
        ]);
        const nextProducts = Array.isArray(productsResponse.data) ? productsResponse.data : productsResponse.data?.items || [];
        setProducts([...nextProducts].sort((a, b) => {
          const aUnavailable = isUnavailable(a);
          const bUnavailable = isUnavailable(b);
          if (aUnavailable !== bUnavailable) return aUnavailable ? 1 : -1;
          return 0;
        }));
        setCategories(Array.isArray(categoriesResponse.data) ? categoriesResponse.data : []);
      } catch (error) {
        console.error('Failed to fetch products', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, [query, selectedCategoryId, sort]);

  const qtyById = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of cart) map.set(item.id, item.quantity);
    return map;
  }, [cart]);

  const groupedSections = useMemo(() => {
    const grouped = new Map<string, { id: string; name: string; products: any[] }>();
    for (const category of categories) grouped.set(category.id, { id: category.id, name: category.name, products: [] });

    for (const product of products) {
      const id = getCategoryId(product);
      const name = getCategoryName(product);
      if (!grouped.has(id)) grouped.set(id, { id, name, products: [] });
      grouped.get(id)?.products.push(product);
    }

    return Array.from(grouped.values()).filter((section) => section.products.length > 0);
  }, [categories, products]);

  const SORT_OPTIONS = [
    { label: 'Newest first', value: 'newest' },
    { label: 'Price: Low to High', value: 'price_asc' },
    { label: 'Price: High to Low', value: 'price_desc' },
    { label: 'Name: A to Z', value: 'name_asc' },
    { label: 'Name: Z to A', value: 'name_desc' },
  ];

  const quickLinks = [
    { label: 'Deals', icon: '🏷️', href: '/shop/deals' },
    { label: 'Reorder', icon: '🔄', href: '/shop/reorder' },
    { label: 'Wishlist', icon: '❤️', href: '/shop/wishlist', count: wishlist.count },
    { label: 'Orders', icon: '📦', href: '/shop/orders' },
    { label: 'Addresses', icon: '📍', href: '/shop/addresses' },
  ];

  const activeHeading = selectedCategoryId
    ? categories.find((c) => c.id === selectedCategoryId)?.name || 'Products'
    : query
      ? `Results for "${query}"`
      : 'Shop by Category';

  const renderProduct = (product: any) => {
    const qty = qtyById.get(product.id) || 0;
    const wished = wishlist.has(product.id);
    const price = typeof product.price === 'number' ? product.price : Number(product.price) || 0;

    return (
      <div key={product.id} className="w-[172px] shrink-0 sm:w-[190px] lg:w-[204px]">
        <ProductCard
          product={product}
          qty={qty}
          wished={wished}
          onAdd={() => addToCart({ id: product.id, name: product.name, price, image: product.image || undefined })}
          onIncrement={() => updateQuantity(product.id, qty + 1)}
          onDecrement={() => updateQuantity(product.id, qty - 1)}
          onToggleWish={() => wishlist.toggle({ id: product.id, name: product.name, price })}
        />
      </div>
    );
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <CustomerShell
        totalItems={totalItems}
        query={query}
        onQueryChange={setQuery}
        onCartOpen={() => setIsCartOpen(true)}
      >
        <div className="space-y-6 pb-24 md:pb-8">
          <PromotionHeroCarousel campaigns={promotions.HOME_HERO} />

          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">⚡</span>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-950">Quick Links</h2>
            </div>
            <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
              {quickLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => router.push(link.href)}
                  className="group flex shrink-0 items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
                >
                  <span className="text-xl">{link.icon}</span>
                  <span className="text-sm font-black text-slate-950 transition-colors group-hover:text-teal-700">{link.label}</span>
                  {link.count != null && link.count > 0 && (
                    <span className="ml-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-amber-400 px-1 text-[10px] font-black text-slate-950">
                      {link.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">🎉</span>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-950">Today&apos;s Offers</h2>
            </div>
            <OfferBanner campaigns={promotions.HOME_TODAY_OFFERS} />
          </section>

          <section>
            <div className="mb-3 flex items-center gap-2">
              <span className="text-lg">📂</span>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-950">Categories</h2>
            </div>
            <CategoryRail categories={categories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
          </section>

          <section>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{selectedCategoryId || query ? '🔍' : '🛒'}</span>
                  <h2 className="truncate text-sm font-black uppercase tracking-wider text-slate-950">{activeHeading}</h2>
                  {products.length > 0 && (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                      {products.length} items
                    </span>
                  )}
                </div>
              </div>

              <div className="relative shrink-0">
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{SORT_OPTIONS.find((o) => o.value === sort)?.label}</span>
                  <span className="sm:hidden">Sort</span>
                </button>
                {sortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { setSort(option.value); setSortMenuOpen(false); }}
                          className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                            sort === option.value ? 'bg-teal-50 font-black text-teal-800' : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </section>

          {loading ? (
            <div className="space-y-6">
              {Array.from({ length: 4 }).map((_, sectionIndex) => (
                <section key={sectionIndex} className="rounded-3xl border border-slate-100 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="h-5 w-36 rounded bg-slate-100" />
                    <div className="h-4 w-16 rounded bg-slate-100" />
                  </div>
                  <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 5 }).map((__, i) => (
                      <div key={i} className="w-[172px] shrink-0 overflow-hidden rounded-2xl border border-slate-100 bg-white animate-pulse sm:w-[190px] lg:w-[204px]">
                        <div className="aspect-[4/3] bg-slate-100" />
                        <div className="space-y-2 p-3">
                          <div className="h-3 w-3/4 rounded bg-slate-100" />
                          <div className="h-3 w-1/2 rounded bg-slate-100" />
                          <div className="flex items-center justify-between pt-2">
                            <div className="h-4 w-16 rounded bg-slate-100" />
                            <div className="h-8 w-16 rounded-xl bg-slate-100" />
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : products.length === 0 ? (
            <EmptyState
              icon={Package}
              title="No products found"
              description="Try a different search or browse a different category."
              action={query ? { label: 'Clear search', onClick: () => setQuery('') } : undefined}
            />
          ) : (
            <div className="space-y-7">
              {groupedSections.map((section) => (
                <section key={section.id} id={`category-${section.id}`} className="rounded-3xl border border-slate-100 bg-white/80 p-4 shadow-sm shadow-slate-200/40">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-2xl bg-teal-50 text-lg">🛍️</span>
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-black text-slate-950">{section.name}</h3>
                          <p className="text-xs font-bold text-slate-400">{section.products.length} item{section.products.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </div>
                    {!selectedCategoryId && (
                      <button
                        onClick={() => setSelectedCategoryId(section.id === 'uncategorized' ? '' : section.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
                      >
                        View all <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="scrollbar-none -mx-4 flex gap-3 overflow-x-auto px-4 pb-2 snap-x snap-mandatory">
                    {section.products.map((product) => (
                      <div key={product.id} className="snap-start">
                        {renderProduct(product)}
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}

          {totalItems > 0 && (
            <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 px-4 md:mx-auto md:max-w-7xl md:px-0">
              <div className="pointer-events-auto flex items-center justify-between rounded-2xl bg-slate-950 px-5 py-3.5 shadow-2xl shadow-slate-950/30">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-black text-white">
                    <Package className="h-3.5 w-3.5" />
                    {totalItems} item{totalItems !== 1 ? 's' : ''}
                  </div>
                  <span className="text-lg font-black text-white">₹{totalPrice.toFixed(0)}</span>
                </div>
                <button
                  onClick={() => router.push('/shop/checkout')}
                  className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-teal-900/20 transition-all hover:-translate-y-0.5 hover:bg-teal-500"
                >
                  Checkout →
                </button>
              </div>
            </div>
          )}
        </div>
      </CustomerShell>

      <CartSheet
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        cart={cart}
        totalItems={totalItems}
        totalPrice={totalPrice}
        onIncrement={(id) => { const item = cart.find((i) => i.id === id); if (item) updateQuantity(id, item.quantity + 1); }}
        onDecrement={(id) => { const item = cart.find((i) => i.id === id); if (item) updateQuantity(id, item.quantity - 1); }}
        onRemove={removeFromCart}
        onCheckout={() => { setIsCartOpen(false); router.push('/shop/checkout'); }}
      />
    </DashboardLayout>
  );
}
