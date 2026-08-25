'use client';

import React, { FormEvent, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  CheckCircle2,
  ChevronDown,
  Clock3,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  User,
  ChevronUp,
} from 'lucide-react';
import { apiClient, getProductImage } from '@aagam/utils';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';
import { normalizePromotionPlacements } from '@/lib/promotion-normalizer';
import AagamLogo from '@/components/AagamLogo';

type Campaign = {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badgeText?: string | null;
  imageUrl?: string | null;
  mobileImageUrl?: string | null;
  backgroundColor?: string | null;
  textColor?: string | null;
  accentColor?: string | null;
  ctaLabel?: string | null;
  targetUrl?: string | null;
};

const FALLBACK_HERO: Record<string, string | null> = {
  badgeText: 'Farm fresh. Locally sourced.',
  title: 'Fresh groceries.',
  subtitle: 'Delivered with trust.',
  description: 'From farm to your home – handpicked quality, local stores and on-time delivery you can count on.',
  ctaLabel: 'Shop now',
  targetUrl: '#offers',
  backgroundColor: '#073f3d',
  textColor: '#ffffff',
  accentColor: '#20c9a6',
  imageUrl: null,
  mobileImageUrl: null,
};

const trustItems = [
  { icon: PackageCheck, title: 'Fresh Sourcing', copy: 'Sourced daily from farms and trusted growers.' },
  { icon: Store, title: 'Local Stores', copy: 'Partnering with local stores to support our community.' },
  { icon: Truck, title: 'Trusted Delivery', copy: 'On-time delivery with care and hygiene.' },
  { icon: Clock3, title: 'Easy Subscriptions', copy: 'Flexible plans that save time and money.' },
];

const proofStats = [
  { value: '100K+', label: 'Happy customers' },
  { value: '4.6/5', label: 'Average rating' },
  { value: '90+', label: 'Areas served' },
  { value: '98%', label: 'On-time delivery' },
];

function moneyFromPaise(value: unknown) {
  return formatINR(Math.max(0, Number(value || 0)) / 100);
}

function CampaignPicture({ campaign }: { campaign: Campaign }) {
  if (!campaign.imageUrl && !campaign.mobileImageUrl) return null;
  return (
    <picture className="absolute inset-0">
      {campaign.mobileImageUrl ? (
        <source media="(max-width: 767px)" srcSet={campaign.mobileImageUrl} />
      ) : null}
      <img
        src={campaign.imageUrl || campaign.mobileImageUrl || ''}
        alt={campaign.title || 'Promotion'}
        className="h-full w-full object-cover object-center"
      />
    </picture>
  );
}

function planSavings(plan: any) {
  const mrp = Number(plan?.mrpPaise || 0);
  const price = Number(plan?.pricePaise || 0);
  if (mrp <= price || mrp <= 0) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function productDiscount(product: any) {
  const price = Number(product?.price || 0);
  const mrp = Number(product?.mrpPaise || 0) / 100;
  if (!price || mrp <= price) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
}

function productUnit(product: any) {
  if (product?.unitLabel) return product.unitLabel;
  if (product?.weightLabel) return product.weightLabel;
  if (Number(product?.weightGrams) > 0) {
    const grams = Number(product.weightGrams);
    return grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`;
  }
  return product?.category?.name || '';
}

function SkeletonCard() {
  return (
    <div className="flex min-h-[174px] flex-col rounded-[8px] border border-[#e4e9e6] bg-white p-2">
      <div className="h-[76px] animate-pulse rounded-md bg-slate-100" />
      <div className="mt-2 h-3 w-3/4 animate-pulse rounded bg-slate-100" />
      <div className="mt-1 h-2 w-1/2 animate-pulse rounded bg-slate-100" />
      <div className="mt-2 h-3 w-1/3 animate-pulse rounded bg-slate-100" />
      <div className="mt-auto pt-2">
        <div className="h-7 w-full animate-pulse rounded-md bg-slate-100" />
      </div>
    </div>
  );
}

function SkeletonCategory() {
  return (
    <div className="h-[108px] animate-pulse overflow-hidden rounded-[8px] bg-slate-100" />
  );
}

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [heroCampaign, setHeroCampaign] = useState<any>(null);
  const [landingBanner, setLandingBanner] = useState<any>(null);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const { cart, addToCart, updateQuantity, totalItems } = useCart();

  useEffect(() => {
    const onScroll = () => setShowBackToTop(window.scrollY > 600);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    let active = true;
    const loadLanding = async () => {
      setLoading(true);
      const [productResult, categoryResult, planResult, promotionResult] = await Promise.allSettled([
        apiClient.get('/products', { params: { page: 1, pageSize: 12 } }),
        apiClient.get('/products/categories'),
        apiClient.get('/subscriptions/plans'),
        apiClient.get('/public/promotions/active'),
      ]);
      if (!active) return;

      if (productResult.status === 'fulfilled') {
        const payload = productResult.value.data;
        const items = Array.isArray(payload) ? payload : payload?.items || payload?.products || [];
        setProducts(items.filter((item: any) => item?.availability?.isVisible !== false));
      }
      if (categoryResult.status === 'fulfilled') {
        setCategories(Array.isArray(categoryResult.value.data) ? categoryResult.value.data : []);
      }
      if (planResult.status === 'fulfilled') {
        setSubscriptionPlans(Array.isArray(planResult.value.data) ? planResult.value.data : []);
      }
      if (promotionResult.status === 'fulfilled') {
        const placements = normalizePromotionPlacements(promotionResult.value.data);
        setHeroCampaign((placements.LANDING_HERO || [])[0] || null);
        setLandingBanner((placements.LANDING_BANNER || [])[0] || null);
      }
      setLoading(false);
    };
    loadLanding().catch(() => setLoading(false));
    return () => { active = false; };
  }, []);

  const hero = { ...FALLBACK_HERO, ...heroCampaign };
  const normalizedQuery = query.trim().toLowerCase();
  const featuredProducts = products
    .filter((item) => item?.availability?.inStock !== false)
    .filter((item) => {
      if (!normalizedQuery) return true;
      return [item?.name, item?.category?.name, item?.description]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    })
    .slice(0, 6);
  const visiblePlans = subscriptionPlans.slice(0, 3);

  const visibleCategories = useMemo(() => {
    if (categories.length) return categories.slice(0, 5);
    const seen = new Map<string, any>();
    for (const product of products) {
      const category = product?.category;
      if (category?.id && !seen.has(category.id)) seen.set(category.id, category);
    }
    return Array.from(seen.values()).slice(0, 5);
  }, [categories, products]);

  const categoryImage = (category: any) => {
    if (category?.imageUrl) return category.imageUrl;
    const first = products.find((item) => (item?.categoryId || item?.category?.id) === category?.id);
    return first ? getProductImage(first) : '';
  };

  const qtyById = useMemo(() => new Map(cart.map((item) => [item.id, item.quantity])), [cart]);

  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    document.getElementById('offers')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const showCategory = (categoryName: string) => {
    setQuery(categoryName);
    requestAnimationFrame(() => document.getElementById('offers')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const publicHeroTarget = hero.targetUrl?.startsWith('/shop') ? '#offers' : hero.targetUrl;

  return (
    <main className="min-h-screen bg-[#f7f8f7] text-[#16231f]">
      <header className="sticky top-0 z-50 border-b border-white/10 bg-[#063b3a] text-white shadow-sm">
        <div className="mx-auto flex h-[64px] max-w-[1448px] items-center gap-4 px-4 sm:px-5 lg:px-10">
          <div className="mr-2 shrink-0"><AagamLogo inverse compact label="Fresh, quality & trust" /></div>

          <nav className="hidden items-center gap-7 text-[12px] font-bold text-white/90 xl:flex">
            <a href="#categories" className="inline-flex items-center gap-1 hover:text-emerald-300">Categories <ChevronDown className="h-3 w-3" /></a>
            <a href="#subscriptions" className="hover:text-emerald-300">Subscriptions</a>
            <a href="#offers" className="hover:text-emerald-300">Offers</a>
            <a href="#service-area" className="hover:text-emerald-300">Store Locator</a>
            <a href="#about" className="hover:text-emerald-300">About Us</a>
          </nav>

          <form onSubmit={submitSearch} className="ml-auto hidden min-w-0 flex-1 md:block lg:max-w-[300px]">
            <label className="relative block">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/55" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder='Search for "Fruits, Atta, Oil..."'
                className="h-9 w-full rounded-xl border border-white/10 bg-white/10 pl-9 pr-3 text-[11px] font-semibold text-white outline-none placeholder:text-white/55 focus:border-emerald-300/60 focus:bg-white/15"
              />
            </label>
          </form>

          <a href="#service-area" className="hidden h-9 items-center gap-2 rounded-lg border border-white/20 px-3 text-[10px] font-bold text-white/90 lg:flex">
            <MapPin className="h-4 w-4" />
            <span><span className="block text-[10px] font-semibold text-white/55">Delivering to</span>Choose location</span>
            <ChevronDown className="h-3 w-3" />
          </a>
          <Link href="/login" className="hidden items-center gap-1.5 whitespace-nowrap text-[11px] font-bold md:flex"><User className="h-4 w-4" /> Sign in</Link>
          <a href="#offers" className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-[#20bfa6] px-5 text-[11px] font-black text-white shadow-lg shadow-black/10 transition hover:bg-[#24cdb1]">
            Shop now <ShoppingBag className="h-3.5 w-3.5" />{totalItems > 0 ? <span className="rounded-full bg-white px-1.5 py-0.5 text-[9px] text-[#063b3a]">{totalItems}</span> : null}
          </a>
        </div>
        <nav aria-label="Landing sections" className="flex h-10 items-center gap-1 overflow-x-auto border-t border-white/10 px-3 text-[10px] font-black text-white/85 xl:hidden">
          <a href="#categories" className="shrink-0 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-emerald-200">Categories</a>
          <a href="#subscriptions" className="shrink-0 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-emerald-200">Subscriptions</a>
          <a href="#offers" className="shrink-0 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-emerald-200">Offers</a>
          <a href="#service-area" className="shrink-0 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-emerald-200">Store Locator</a>
          <a href="#about" className="shrink-0 rounded-full px-3 py-2 transition hover:bg-white/10 hover:text-emerald-200">About Us</a>
        </nav>
      </header>

      <section className="relative overflow-hidden bg-[#073f3d] text-white" style={{ backgroundColor: hero.backgroundColor || '#073f3d' }}>
        {hero.imageUrl || hero.mobileImageUrl ? (
          <picture className="absolute inset-0">
            {hero.mobileImageUrl ? <source media="(max-width: 767px)" srcSet={hero.mobileImageUrl} /> : null}
            <img src={hero.imageUrl || hero.mobileImageUrl} alt={hero.title || 'Aagaam'} className="h-full w-full object-cover object-center" />
          </picture>
        ) : null}
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(3,47,46,.92)_0%,rgba(3,47,46,.72)_52%,rgba(3,47,46,.90)_100%)] md:bg-[linear-gradient(90deg,rgba(3,47,46,.96)_0%,rgba(3,47,46,.92)_34%,rgba(3,47,46,.30)_58%,rgba(3,47,46,.02)_100%)]" />
        <div className="relative mx-auto min-h-[420px] max-w-[1448px] px-5 py-7 md:min-h-[302px] lg:px-16">
          <div className="max-w-[560px]">
            {hero.badgeText ? <span className="inline-flex rounded-md border border-emerald-300/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-200">✓ {hero.badgeText}</span> : null}
            <h1 className="mt-3 font-serif text-[30px] font-bold leading-[1.01] tracking-[-0.025em] sm:text-[38px] md:text-[48px]">
              <span className="block" style={{ color: hero.textColor || '#fff' }}>{hero.title}</span>
              <span className="mt-1 block" style={{ color: hero.accentColor || '#20c9a6' }}>{hero.subtitle}</span>
            </h1>
            <p className="mt-3 max-w-[480px] text-[13px] font-semibold leading-5 text-white/90">{hero.description}</p>
            <div className="mt-5 flex flex-wrap gap-3">
              {publicHeroTarget ? <a href={publicHeroTarget} className="inline-flex h-10 items-center gap-3 rounded-lg px-7 text-[11px] font-black text-[#063b3a] shadow-lg" style={{ backgroundColor: hero.accentColor || '#20c9a6' }}>
                {hero.ctaLabel || 'Shop now'} <ArrowRight className="h-4 w-4" />
              </a> : <span className="inline-flex h-10 items-center rounded-lg px-7 text-[11px] font-black text-white/70" style={{ backgroundColor: hero.accentColor || '#20c9a6' }}>
                {hero.ctaLabel || 'Shop now'}
              </span>}
              <a href="#subscriptions" className="inline-flex h-10 items-center rounded-lg border border-white/45 px-7 text-[11px] font-black text-white backdrop-blur-sm">Explore subscriptions</a>
            </div>
            <div className="mt-5 grid max-w-[535px] grid-cols-3 divide-x divide-white/20 text-white">
              <div className="flex items-center gap-2 pr-4"><Truck className="h-5 w-5 shrink-0 text-emerald-200" /><span className="text-[10px] font-bold leading-4">Free delivery<br />on eligible orders</span></div>
              <div className="flex items-center gap-2 px-4"><MapPin className="h-5 w-5 shrink-0 text-emerald-200" /><span className="text-[10px] font-bold leading-4">Delivering in<br />90+ areas</span></div>
              <div className="flex items-center gap-2 pl-4"><ShieldCheck className="h-5 w-5 shrink-0 text-emerald-200" /><span className="text-[10px] font-bold leading-4">Best quality<br />always</span></div>
            </div>
          </div>
          <div className="absolute bottom-4 right-6 hidden items-center gap-3 rounded-full border border-white/20 bg-[#173c39]/90 px-4 py-2.5 shadow-xl backdrop-blur-md md:flex">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-[#eaf8f3] text-[#087765]"><Truck className="h-5 w-5" /></span>
            <span><strong className="block text-[11px]">On-time delivery</strong><small className="block text-[10px] text-white/75">Every time, guaranteed.</small></span>
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-[1448px] overflow-hidden rounded-t-[24px] bg-white shadow-[0_-4px_18px_rgba(10,50,45,.06)]">
        <section id="categories" className="scroll-mt-28 px-5 pb-2 pt-4 xl:scroll-mt-20 lg:px-16">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[14px] font-black">Shop by category</h2>
            <a href="#offers" className="inline-flex items-center gap-2 text-[10px] font-black text-[#087765]">Browse catalogue <ArrowRight className="h-3 w-3" /></a>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {loading
              ? Array.from({ length: 5 }).map((_, i) => <SkeletonCategory key={i} />)
              : visibleCategories.map((category) => {
                const image = categoryImage(category);
                return (
                  <button key={category.id} type="button" onClick={() => showCategory(category.name)} className="group relative h-[108px] overflow-hidden rounded-[8px] bg-[#e9efe9] text-left shadow-sm transition-shadow hover:shadow-md">
                    {image ? <img src={image} alt={category.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-105" /> : null}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                    <span className="absolute bottom-2 left-3 text-[12px] font-black text-white">{category.name}</span>
                  </button>
                );
              })}
            {!visibleCategories.length && !loading ? <p className="col-span-full py-6 text-center text-xs font-semibold text-slate-400">Categories will appear here when the catalogue has published categories.</p> : null}
          </div>
        </section>

        <section id="offers" className="scroll-mt-28 px-5 pb-4 pt-2 xl:scroll-mt-20 lg:px-16">
          <div className="mb-2 flex items-center justify-between">
            <div><span className="text-[10px] font-black uppercase tracking-[0.16em] text-[#078b70]">Public catalogue</span><h2 className="text-[14px] font-black">Today&apos;s offers</h2></div>
            {normalizedQuery ? <button type="button" onClick={() => setQuery('')} className="text-[10px] font-black text-[#087765]">Clear filter</button> : <span className="text-[10px] font-bold text-slate-500">Add items before signing in</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {loading
              ? Array.from({ length: 6 }).map((_, i) => <SkeletonCard key={i} />)
              : featuredProducts.map((product) => {
                const qty = qtyById.get(String(product.id)) || 0;
                const discount = productDiscount(product);
                const mrp = Number(product?.mrpPaise || 0) / 100;
                return (
                  <article key={product.id} className="flex min-h-[174px] flex-col rounded-[8px] border border-[#e4e9e6] bg-white p-2 shadow-[0_1px_4px_rgba(20,40,35,.04)]">
                    <div className="flex h-[76px] items-center justify-center overflow-hidden rounded-md bg-white">
                      <img
                        src={getProductImage(product)}
                        alt={product.name}
                        className="h-full w-full object-contain transition hover:scale-105"
                        onError={(e) => { (e.target as HTMLImageElement).src = '/brand/aagam-mark'; }}
                      />
                    </div>
                    <div className="mt-1 line-clamp-1 text-[11px] font-black text-[#17231f]">{product.name}</div>
                    <p className="mt-0.5 min-h-[14px] text-[10px] font-semibold text-slate-500">{productUnit(product)}</p>
                    <div className="mt-1 flex items-center gap-1.5 text-[10px]"><strong className="text-[11px]">{formatINR(Number(product.price || 0))}</strong>{mrp > Number(product.price || 0) ? <span className="text-slate-400 line-through">{formatINR(mrp)}</span> : null}{discount > 0 ? <span className="rounded bg-emerald-50 px-1 py-0.5 text-[9px] font-black text-emerald-700">{discount}% OFF</span> : null}</div>
                    <div className="mt-auto pt-2">
                      {qty > 0 ? (
                        <div className="flex h-7 items-center justify-between rounded-md bg-[#078b70] px-1 text-white">
                          <button onClick={() => updateQuantity(String(product.id), qty - 1)} className="grid h-6 w-6 place-items-center text-sm font-black">−</button>
                          <span className="text-[10px] font-black">{qty}</span>
                          <button onClick={() => updateQuantity(String(product.id), qty + 1)} className="grid h-6 w-6 place-items-center text-sm font-black">+</button>
                        </div>
                      ) : (
                        <button onClick={() => addToCart(product)} className="flex h-7 w-full items-center justify-center gap-1.5 rounded-md bg-[#078b70] text-[10px] font-black text-white transition hover:bg-[#06735f]"><ShoppingBag className="h-3 w-3" /> Add to Cart</button>
                      )}
                    </div>
                  </article>
                );
              })}
            {!featuredProducts.length && !loading ? <p className="col-span-full py-8 text-center text-xs font-semibold text-slate-400">Featured products will appear here from the published catalogue.</p> : null}
          </div>
        </section>

        <section id="service-area" className="scroll-mt-28 mx-5 mb-4 rounded-2xl border border-emerald-100 bg-[linear-gradient(135deg,#effbf7,#ffffff)] px-5 py-5 xl:scroll-mt-20 lg:mx-16 lg:flex lg:items-center lg:justify-between lg:px-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#087765] text-white"><MapPin className="h-6 w-6" /></span>
            <div>
              <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[#078b70]">Aagaam near you</span>
              <h2 className="mt-1 text-lg font-black">Serving 90+ neighbourhood areas</h2>
              <p className="mt-1 max-w-2xl text-[11px] font-semibold leading-5 text-slate-600">We fulfil from verified local partner stores and match each order to the nearest serviceable location. Browse the public catalogue here; sign in only when you are ready to confirm an address and checkout.</p>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 lg:mt-0 lg:pl-8">
            <a href="#categories" className="inline-flex h-10 items-center rounded-xl border border-emerald-200 bg-white px-5 text-[11px] font-black text-[#087765]">Browse areas & categories</a>
            <Link href="/login" className="inline-flex h-10 items-center rounded-xl bg-[#087765] px-5 text-[11px] font-black text-white">Sign in to check address</Link>
          </div>
        </section>

        <section id="subscriptions" className="scroll-mt-28 mx-5 mb-0 rounded-[10px] bg-[#f5f7f6] p-3 xl:scroll-mt-20 lg:mx-10 lg:px-6">
          <div className="grid gap-3 lg:grid-cols-[180px_1fr_1fr_1fr]">
            <div className="flex flex-col justify-center px-2">
              <h2 className="text-[16px] font-black">Subscribe & Save</h2>
              <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-600">Goodness on repeat.<br />Save more with<br />flexible subscriptions.</p>
              <Link href="/login" className="mt-3 inline-flex items-center gap-2 text-[10px] font-black text-[#087765]">Sign in for all plans <ArrowRight className="h-3 w-3" /></Link>
            </div>
            {visiblePlans.map((plan) => {
              const save = planSavings(plan);
              const image = plan.imageUrl || plan.mobileImageUrl;
              return (
                <article key={plan.id} className="relative grid min-h-[112px] grid-cols-[105px_1fr] overflow-hidden rounded-[8px] border border-[#e1e6e3] bg-white p-2 shadow-sm">
                  {save > 0 ? <span className="absolute right-2 top-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-black text-emerald-700">Save {save}%</span> : null}
                  <div className="mr-3 overflow-hidden rounded-md bg-[#eef2ef]">{image ? <img src={image} alt={plan.name || 'Subscription plan'} className="h-full w-full object-cover" /> : <div className="grid h-full place-items-center"><PackageCheck className="h-7 w-7 text-emerald-700" /></div>}</div>
                  <div className="min-w-0 pr-1">
                    <h3 className="line-clamp-1 text-[11px] font-black">{plan.name}</h3>
                    <p className="mt-1 line-clamp-1 text-[10px] font-semibold text-slate-500">{plan.description || `${plan.totalDeliveries || ''} scheduled deliveries`}</p>
                    <div className="mt-2 flex items-baseline gap-1"><strong className="text-[11px]">{moneyFromPaise(plan.pricePaise)}</strong>{Number(plan.mrpPaise) > Number(plan.pricePaise) ? <span className="text-[10px] text-slate-400 line-through">{moneyFromPaise(plan.mrpPaise)}</span> : null}</div>
                    <Link href="/login" className="mt-2 inline-flex h-7 items-center rounded-md bg-[#078b70] px-3 text-[10px] font-black text-white">Sign in to subscribe</Link>
                  </div>
                </article>
              );
            })}
            {!visiblePlans.length && !loading ? <div className="lg:col-span-3 grid min-h-[110px] place-items-center text-xs font-semibold text-slate-400">Active subscription plans will appear here automatically.</div> : null}
          </div>
        </section>

        <section className="mt-0 bg-[#073f3d] px-5 py-4 text-white lg:px-16">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {trustItems.map((item, index) => (
              <div key={item.title} className={`flex items-center gap-4 ${index ? 'lg:border-l lg:border-white/20 lg:pl-8' : ''}`}>
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white/10"><item.icon className="h-5 w-5 text-emerald-100" /></span>
                <span><strong className="block text-[11px]">{item.title}</strong><small className="mt-1 block max-w-[190px] text-[10px] font-semibold leading-4 text-white/75">{item.copy}</small></span>
              </div>
            ))}
          </div>
        </section>

        <section id="about" className="scroll-mt-28 grid min-h-[94px] items-stretch border-b border-[#e4e8e6] bg-[#f7faf8] xl:scroll-mt-20 lg:grid-cols-[1.15fr_1.65fr_1.25fr]">
          <div className="flex items-center gap-3 px-6 py-4 lg:px-12">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#dcefe7] text-[#087765]"><User className="h-5 w-5" /></span>
            <div><div className="text-[11px] tracking-[0.08em] text-amber-500">★★★★★</div><p className="mt-1 text-[11px] font-semibold leading-4 text-slate-600">&ldquo;Aagaam never disappoints! Vegetables are always fresh and delivery is super reliable.&rdquo;</p><strong className="mt-1 block text-[10px] text-[#087765]">— Priya S., Bengaluru</strong></div>
          </div>
          <div className="grid grid-cols-4 items-center border-y border-[#e4e8e6] px-3 py-3 lg:border-x lg:border-y-0">
            {proofStats.map((stat) => <div key={stat.label} className="text-center"><strong className="block text-[16px] font-black">{stat.value}</strong><span className="mt-0.5 block text-[10px] font-semibold text-slate-500">{stat.label}</span></div>)}
          </div>
          <div className="relative min-h-[94px] overflow-hidden px-6 py-4 lg:px-8" style={landingBanner?.backgroundColor ? { backgroundColor: landingBanner.backgroundColor } : undefined}>
            {landingBanner ? <CampaignPicture campaign={landingBanner} /> : null}
            <div className="absolute inset-0 bg-gradient-to-r from-[#f7faf8]/95 via-[#f7faf8]/80 to-transparent" />
            <div className="relative max-w-[250px]"><strong className="text-[11px]" style={landingBanner?.textColor ? { color: landingBanner.textColor } : { color: '#087765' }}>{landingBanner?.title || 'Supporting local farmers'}</strong><p className="mt-1 text-[10px] font-semibold leading-4 text-slate-600">{landingBanner?.subtitle || landingBanner?.description || 'We work directly with farmers to bring you fresh produce and a better tomorrow.'}</p>{landingBanner?.targetUrl ? <Link href={landingBanner.targetUrl} className="mt-2 inline-flex items-center gap-2 text-[10px] font-black" style={landingBanner?.textColor ? { color: landingBanner.textColor } : { color: '#087765' }}>{landingBanner?.ctaLabel || 'Know more'} <ArrowRight className="h-3 w-3" /></Link> : null}</div>
          </div>
        </section>
      </div>

      <footer className="bg-[#063b3a] text-white">
        <div className="mx-auto grid max-w-[1448px] gap-7 px-6 py-6 md:grid-cols-2 lg:grid-cols-[1.25fr_.8fr_.8fr_1.2fr_1.1fr] lg:px-10">
          <div><AagamLogo inverse compact label="Fresh, quality and trust" /><p className="mt-3 max-w-[230px] text-[10px] font-semibold leading-4 text-white/70">Your trusted neighbourhood partner for fresh groceries and everyday essentials.</p><p className="mt-4 text-[10px] text-white/50">&copy; 2026 Aagaam Retail Pvt. Ltd. All rights reserved.</p></div>
          <div><h3 className="text-[11px] font-black">Shop</h3><div className="mt-2 grid gap-1 text-[10px] font-semibold text-white/70"><Link href="/shop">All Categories</Link><Link href="/shop?category=Fruits+%26+Vegetables">Fruits & Vegetables</Link><Link href="/shop?category=Dairy+%26+Eggs">Dairy & Eggs</Link><Link href="/shop/deals">Deals</Link><Link href="/shop?category=Beverages">Beverages</Link></div></div>
          <div><h3 className="text-[11px] font-black">Help & Support</h3><div className="mt-2 grid gap-1 text-[10px] font-semibold text-white/70"><a href="tel:+918340064486">Contact Us</a><a href="#offers">Browse catalogue</a><a href="#offers">Current offers</a><a href="#subscriptions">Subscription plans</a></div></div>
          <div><h3 className="text-[11px] font-black">Company</h3><div className="mt-2 grid gap-1 text-[10px] font-semibold text-white/70"><a href="#about">About Us</a><Link href="/partner">Careers & Partners</Link><a href="#service-area">Store Locator</a><Link href="/terms">Terms & Conditions</Link><Link href="/privacy">Privacy Policy</Link></div></div>
          <div><h3 className="text-[11px] font-black">Offers & updates</h3><p className="mt-1 text-[10px] font-semibold text-white/60">Browse current promotions and savings directly on this public page.</p><a href="#offers" className="mt-2 inline-flex h-8 items-center gap-2 rounded-md bg-[#20bfa6] px-4 text-[10px] font-black text-white">View current offers <ArrowRight className="h-3 w-3" /></a></div>
        </div>
      </footer>

      {showBackToTop && (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 z-50 grid h-10 w-10 place-items-center rounded-full bg-[#087765] text-white shadow-lg transition hover:bg-[#06735f] md:hidden"
          aria-label="Back to top"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      )}
    </main>
  );
}
