'use client';

import { useMemo, useState, useEffect } from 'react';
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
import EmptyState from '@/components/customer/EmptyState';
import { Package, SlidersHorizontal, ArrowRight, CalendarDays, ShoppingCart } from 'lucide-react';
import SubscriptionPlanCard from '@/components/subscriptions/SubscriptionPlanCard';
import CartSheet from '@/components/customer/CartSheet';

const emptyPlacements = (): PromotionPlacements => ({
  HOME_HERO: [],
  HOME_TODAY_OFFERS: [],
  DEALS_PAGE: [],
});

const normalizePlacements = (payload: unknown): PromotionPlacements => {
  const placements = payload && typeof payload === 'object'
    ? payload as Partial<PromotionPlacements>
    : {};
  return {
    HOME_HERO: Array.isArray(placements.HOME_HERO) ? placements.HOME_HERO : [],
    HOME_TODAY_OFFERS: Array.isArray(placements.HOME_TODAY_OFFERS)
      ? placements.HOME_TODAY_OFFERS
      : [],
    DEALS_PAGE: Array.isArray(placements.DEALS_PAGE) ? placements.DEALS_PAGE : [],
  };
};

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
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [sort, setSort] = useState('newest');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const [promotions, setPromotions] = useState<PromotionPlacements>(emptyPlacements);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const { cart, addToCart, removeFromCart, updateQuantity, clearCart, totalPrice, totalItems } = useCart();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const wishlist = useWishlist();
  const router = useRouter();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setSelectedCategoryId(params.get('category') || '');
    setQuery(params.get('search') || '');
    apiClient
      .get('/promotions/active')
      .then((response) => setPromotions(normalizePlacements(response.data?.placements)))
      .catch((error) => {
        setPromotions(emptyPlacements());
        console.error('Failed to load active promotions', error);
      });
    apiClient
      .get('/subscriptions/plans')
      .then((response) => setSubscriptionPlans(Array.isArray(response.data) ? response.data : []))
      .catch((error) => {
        setSubscriptionPlans([]);
        console.error('Failed to load subscription plans', error);
      });
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
    { label: 'Subscriptions', icon: '📅', href: '/shop/subscriptions' },
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
        query={query}
        onQueryChange={setQuery}
      >
        <div className="space-y-5 pb-24 md:pb-8">
          <PromotionHeroCarousel campaigns={promotions.HOME_HERO} />

          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Quick links</h2>
            </div>
            <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
              {quickLinks.map((link) => (
                <button
                  key={link.label}
                  onClick={() => router.push(link.href)}
                  className="group flex shrink-0 items-center gap-2 rounded-lg border border-slate-100 bg-white px-3 py-2 text-left transition-all hover:border-teal-200"
                >
                  <span className="text-base">{link.icon}</span>
                  <span className="text-sm font-medium text-slate-950 transition-colors group-hover:text-teal-700">{link.label}</span>
                  {link.count != null && link.count > 0 && (
                    <span className="ml-1 grid h-5 min-w-[1.25rem] place-items-center rounded-md bg-amber-100 px-1 text-[10px] font-semibold text-amber-800">
                      {link.count}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </section>

          {subscriptionPlans.length > 0 && (
            <section className="rounded-xl border border-emerald-100 bg-emerald-50/30 p-4 sm:p-5">
              <div className="mb-4 flex items-end justify-between gap-3">
                <div><p className="enterprise-kicker"><CalendarDays className="mr-1.5 inline h-3 w-3" /> Subscribe & Save</p><h2 className="mt-2 text-lg font-semibold text-slate-950">Essentials on your schedule</h2><p className="mt-0.5 text-xs text-slate-600">Verified first or weekly cash funding. Funded deliveries are ₹0 due.</p></div>
                <button onClick={() => router.push('/shop/subscriptions')} className="hidden min-h-[44px] items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white sm:flex">View all <ArrowRight className="h-4 w-4" /></button>
              </div>
              <div className="grid gap-3 lg:grid-cols-3">{subscriptionPlans.slice(0, 3).map((plan) => <SubscriptionPlanCard key={plan.id} plan={plan} compact />)}</div>
            </section>
          )}

          <section>
            <div className="mb-2.5 flex items-center gap-2">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">Today&apos;s offers</h2>
            </div>
            <OfferBanner campaigns={promotions.HOME_TODAY_OFFERS} />
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div><p className="enterprise-kicker">Shop by department</p><h2 className="mt-2 text-lg font-semibold text-slate-950">Categories</h2></div>
              <p className="hidden text-[11px] text-slate-500 sm:block">Fresh picks from every aisle</p>
            </div>
            <CategoryRail categories={categories} selectedId={selectedCategoryId} onSelect={setSelectedCategoryId} />
          </section>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-400">{activeHeading}</h2>
                  {products.length > 0 && (
                    <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                      {products.length} items
                    </span>
                  )}
                </div>
              </div>

              <div className="relative shrink-0">
                <button
                  onClick={() => setSortMenuOpen(!sortMenuOpen)}
                  className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-slate-700 transition-colors hover:bg-slate-50"
                >
                  <SlidersHorizontal className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{SORT_OPTIONS.find((o) => o.value === sort)?.label}</span>
                  <span className="sm:hidden">Sort</span>
                </button>
                {sortMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setSortMenuOpen(false)} />
                    <div className="absolute right-0 top-full z-40 mt-1 w-52 rounded-xl border border-slate-100 bg-white p-1.5 ">
                      {SORT_OPTIONS.map((option) => (
                        <button
                          key={option.value}
                          onClick={() => { setSort(option.value); setSortMenuOpen(false); }}
                          className={`w-full rounded-xl px-3 py-2 text-left text-sm font-semibold transition-colors ${
                            sort === option.value ? 'bg-teal-50 font-semibold text-teal-800' : 'text-slate-700 hover:bg-slate-50'
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
                <section key={sectionIndex} className="rounded-xl border border-slate-100 bg-white p-4">
                  <div className="mb-4 flex items-center justify-between">
                    <div className="h-5 w-36 rounded bg-slate-100" />
                    <div className="h-4 w-16 rounded bg-slate-100" />
                  </div>
                  <div className="flex gap-3 overflow-hidden">
                    {Array.from({ length: 5 }).map((__, i) => (
                      <div key={i} className="w-[172px] shrink-0 overflow-hidden rounded-xl border border-slate-100 bg-white animate-pulse sm:w-[190px] lg:w-[204px]">
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
                <section key={section.id} id={`category-${section.id}`} className="rounded-xl border border-slate-100 bg-white/80 p-4  shadow-slate-200/40">
                  <div className="mb-4 flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-teal-50 text-lg">🛍️</span>
                        <div className="min-w-0">
                          <h3 className="truncate text-lg font-semibold text-slate-950">{section.name}</h3>
                          <p className="text-xs font-bold text-slate-400">{section.products.length} item{section.products.length !== 1 ? 's' : ''}</p>
                        </div>
                      </div>
                    </div>
                    {!selectedCategoryId && (
                      <button
                        onClick={() => setSelectedCategoryId(section.id === 'uncategorized' ? '' : section.id)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
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
            <>
              <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 hidden px-4 md:mx-auto md:block md:max-w-md md:px-0">
                <div className="pointer-events-auto flex items-center justify-between rounded-xl bg-slate-950 px-5 py-3.5  shadow-slate-950/30">
                  <button
                    onClick={() => setIsCartOpen(true)}
                    className="flex items-center gap-3 text-left transition hover:opacity-90"
                    aria-label="Open cart drawer"
                  >
                    <div className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-semibold text-white">
                      <Package className="h-3.5 w-3.5" />
                      {totalItems} item{totalItems !== 1 ? 's' : ''}
                    </div>
                    <span className="text-lg font-semibold text-white">₹{totalPrice.toFixed(0)}</span>
                  </button>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setIsCartOpen(true)}
                      className="rounded-xl border border-white/20 bg-white/10 px-3.5 py-2.5 text-xs font-bold text-white transition hover:bg-white/20"
                    >
                      View Cart
                    </button>
                    <button
                      onClick={() => router.push('/shop/checkout')}
                      className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-semibold text-white  shadow-teal-900/20 transition-all  hover:bg-teal-500"
                    >
                      Checkout →
                    </button>
                  </div>
                </div>
              </div>
              <button
                onClick={() => setIsCartOpen(true)}
                className="fixed bottom-24 right-4 z-50 flex items-center gap-2 rounded-full bg-teal-600 px-4 py-3 text-xs font-semibold text-white  shadow-teal-900/30 transition-all  hover:bg-teal-500 md:hidden"
                aria-label="Open cart drawer"
              >
                <ShoppingCart className="h-4 w-4" />
                <span>{totalItems}</span>
                <span className="text-white/80">|</span>
                <span>₹{totalPrice.toFixed(0)}</span>
                <span className="text-white/80">→</span>
              </button>
            </>
          )}

          <CartSheet
            isOpen={isCartOpen}
            onClose={() => setIsCartOpen(false)}
            cart={cart}
            totalItems={totalItems}
            totalPrice={totalPrice}
            onIncrement={(id) => {
              const currentItem = cart.find((item) => item.id === id);
              if (currentItem) updateQuantity(id, currentItem.quantity + 1);
            }}
            onDecrement={(id) => {
              const currentItem = cart.find((item) => item.id === id);
              if (currentItem) updateQuantity(id, currentItem.quantity - 1);
            }}
            onRemove={(id) => removeFromCart(id)}
            onClear={clearCart}
            onCheckout={() => {
              setIsCartOpen(false);
              router.push('/shop/checkout');
            }}
          />
        </div>
      </CustomerShell>
    </DashboardLayout>
  );
}