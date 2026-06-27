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
import ProductCard from '@/components/customer/ProductCard';
import CartSheet from '@/components/customer/CartSheet';
import EmptyState from '@/components/customer/EmptyState';
import { Sparkles, Package, SlidersHorizontal, TrendingUp, Zap, Star, PackageCheck } from 'lucide-react';

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [sort, setSort] = useState('newest');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const { cart, addToCart, updateQuantity, removeFromCart, totalPrice, totalItems } = useCart();
  const wishlist = useWishlist();
  const router = useRouter();

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
        setProducts(Array.isArray(productsResponse.data) ? productsResponse.data : productsResponse.data?.items || []);
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

  const SORT_OPTIONS = [
    { label: 'Newest first', value: 'newest' },
    { label: 'Price: Low to High', value: 'price_asc' },
    { label: 'Price: High to Low', value: 'price_desc' },
    { label: 'Name: A to Z', value: 'name_asc' },
    { label: 'Name: Z to A', value: 'name_desc' },
  ];

  const quickLinks = [
    { label: 'Deals', icon: '🏷️', href: '/shop/deals', color: 'from-amber-500 to-orange-500' },
    { label: 'Reorder', icon: '🔄', href: '/shop/reorder', color: 'from-blue-500 to-indigo-500' },
    { label: 'Wishlist', icon: '❤️', href: '/shop/wishlist', count: wishlist.count, color: 'from-rose-500 to-pink-500' },
    { label: 'Orders', icon: '📦', href: '/shop/orders', color: 'from-violet-500 to-purple-500' },
    { label: 'Addresses', icon: '📍', href: '/shop/addresses', color: 'from-teal-500 to-emerald-500' },
  ];

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <CustomerShell
        totalItems={totalItems}
        query={query}
        onQueryChange={setQuery}
        onCartOpen={() => setIsCartOpen(true)}
      >
        <div className="space-y-6 pb-24 md:pb-8">
          <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-teal-950 p-6 md:p-8 text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(45,212,191,0.15),transparent_40%)]" />
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_80%,rgba(245,158,11,0.1),transparent_40%)]" />
            <div className="relative">
              <p className="inline-flex items-center gap-1.5 rounded-full border border-teal-500/30 bg-teal-500/10 px-3 py-1 text-xs font-black uppercase tracking-[0.2em] text-teal-300">
                <Sparkles className="h-3 w-3" /> Quick Commerce
              </p>
              <h1 className="mt-4 text-3xl md:text-5xl font-black tracking-tight leading-[1.1]">
                Fresh groceries,<br />
                <span className="bg-gradient-to-r from-teal-300 to-amber-300 bg-clip-text text-transparent">delivered in 10 min.</span>
              </h1>
              <p className="mt-3 max-w-lg text-sm font-semibold text-slate-400 leading-6">
                Search, browse by category, save favourites, and check out with live availability.
              </p>

              <div className="mt-6 flex flex-wrap gap-3">
                {[
                  { icon: Zap, label: '10 min delivery', sub: 'Lightning fast' },
                  { icon: Star, label: 'Best prices', sub: 'Guaranteed' },
                  { icon: PackageCheck, label: 'Fresh items', sub: 'Quality assured' },
                ].map((item) => (
                  <div key={item.label} className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/5 backdrop-blur-sm px-3.5 py-2.5">
                    <div className="grid h-8 w-8 place-items-center rounded-lg bg-teal-500/20 text-teal-300">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-black text-white">{item.label}</div>
                      <div className="text-[10px] font-bold text-slate-500">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">⚡</span>
              <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider">Quick Links</h2>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-none">
              {quickLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => router.push(link.href)}
                  className="shrink-0 flex items-center gap-2.5 rounded-2xl border border-slate-100 bg-white px-4 py-3 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md hover:border-teal-200 group"
                >
                  <span className="text-xl">{link.icon}</span>
                  <span className="text-sm font-black text-slate-950 group-hover:text-teal-700 transition-colors">{link.label}</span>
                  {link.count != null && link.count > 0 && (
                    <span className="ml-1 grid h-5 min-w-[1.25rem] place-items-center rounded-full bg-amber-400 text-[10px] font-black text-slate-950 px-1">
                      {link.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">🎉</span>
              <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider">Today&apos;s Offers</h2>
            </div>
            <OfferBanner />
          </section>

          <section>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-lg">📂</span>
              <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider">Categories</h2>
            </div>
            <CategoryRail
              categories={categories}
              selectedId={selectedCategoryId}
              onSelect={setSelectedCategoryId}
            />
          </section>

          <section>
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-lg">
                  {selectedCategoryId ? '🔍' : '🛒'}
                </span>
                <h2 className="text-sm font-black text-slate-950 uppercase tracking-wider">
                  {selectedCategoryId
                    ? categories.find((c) => c.id === selectedCategoryId)?.name || 'Products'
                    : query
                      ? `Results for "${query}"`
                      : 'All Products'}
                </h2>
                {products.length > 0 && (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-black text-slate-600">
                    {products.length} items
                  </span>
                )}
              </div>

              <div className="relative">
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  {SORT_OPTIONS.find((o) => o.value === sort)?.label}
                </button>
                {sortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
                    <div className="absolute right-0 top-full mt-1 z-40 w-52 rounded-2xl border border-slate-100 bg-white p-1.5 shadow-xl">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { setSort(option.value); setSortMenuOpen(false); }}
                          className={`w-full text-left rounded-xl px-3 py-2 text-sm font-semibold transition-colors ${
                            sort === option.value
                              ? 'bg-teal-50 text-teal-800 font-black'
                              : 'text-slate-700 hover:bg-slate-50'
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {Array.from({ length: 10 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-slate-100 bg-white overflow-hidden animate-pulse">
                  <div className="aspect-[4/3] bg-slate-100" />
                  <div className="p-3 space-y-2">
                    <div className="h-3 w-3/4 rounded bg-slate-100" />
                    <div className="h-3 w-1/2 rounded bg-slate-100" />
                    <div className="flex justify-between items-center pt-2">
                      <div className="h-4 w-16 rounded bg-slate-100" />
                      <div className="h-8 w-16 rounded-xl bg-slate-100" />
                    </div>
                  </div>
                </div>
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
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
              {products.map((product) => {
                const qty = qtyById.get(product.id) || 0;
                const wished = wishlist.has(product.id);
                const price = typeof product.price === 'number' ? product.price : Number(product.price) || 0;

                return (
                  <ProductCard
                    key={product.id}
                    product={product}
                    qty={qty}
                    wished={wished}
                    onAdd={() => addToCart({ id: product.id, name: product.name, price, image: undefined })}
                    onIncrement={() => updateQuantity(product.id, qty + 1)}
                    onDecrement={() => updateQuantity(product.id, qty - 1)}
                    onToggleWish={() => wishlist.toggle({ id: product.id, name: product.name, price })}
                  />
                );
              })}
            </div>
          )}

          {totalItems > 0 && (
            <div className="fixed bottom-4 inset-x-0 z-40 px-4 md:px-0 md:max-w-7xl md:mx-auto pointer-events-none">
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
                  className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-teal-900/20 transition-all hover:bg-teal-500 hover:-translate-y-0.5"
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
