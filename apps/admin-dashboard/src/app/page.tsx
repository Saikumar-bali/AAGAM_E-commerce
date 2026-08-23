'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  BadgeCheck,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock3,
  HeartHandshake,
  Leaf,
  MapPin,
  PackageCheck,
  Search,
  ShieldCheck,
  ShoppingBag,
  Store,
  Truck,
  UserRound,
} from 'lucide-react';
import { apiClient, getProductImage } from '@aagam/utils';
import { formatINR } from '@/lib/currency';
import { customerAuthHref } from '@/lib/customer-return-path';
import { normalizePromotionPlacements } from '@/lib/promotion-normalizer';

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

type Category = {
  id: string;
  name: string;
  imageUrl?: string | null;
};

const heroFallback = {
  badgeText: 'Farm fresh. Locally sourced.',
  title: 'Fresh groceries.',
  subtitle: 'Delivered with trust.',
  description: 'From farm to your home — quality groceries, local stores, and dependable delivery in one place.',
  ctaLabel: 'Shop now',
};

const trustItems = [
  { title: 'Fresh sourcing', copy: 'Products from the catalogue you already manage.', icon: Leaf },
  { title: 'Local stores', copy: 'Orders routed through your store network.', icon: Store },
  { title: 'Trusted delivery', copy: 'Pickup, tracking and delivery proof built in.', icon: Truck },
  { title: 'Easy subscriptions', copy: 'Recurring plans from the existing subscription engine.', icon: CalendarDays },
];

function numberFrom(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function categoryImage(category: Category, products: any[]) {
  if (category.imageUrl) return category.imageUrl;
  const match = products.find((product) => (product.categoryId || product.category?.id) === category.id);
  return match ? getProductImage(match) : '';
}

function productPrice(product: any) {
  return typeof product?.price === 'number' ? product.price : numberFrom(product?.price);
}

function productMrp(product: any) {
  const price = productPrice(product);
  const mrp = numberFrom(product?.mrpPaise) / 100;
  return Math.max(price, mrp);
}

function productDiscount(product: any) {
  const price = productPrice(product);
  const mrp = productMrp(product);
  if (mrp <= 0 || price >= mrp) return 0;
  return Math.round(((mrp - price) / mrp) * 100);
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
        alt=""
        className="h-full w-full object-cover object-center"
      />
    </picture>
  );
}

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [placements, setPlacements] = useState<Record<string, Campaign[]>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    Promise.allSettled([
      apiClient.get('/products', { params: { pageSize: 12, sort: 'newest' } }),
      apiClient.get('/products/categories'),
      apiClient.get('/subscriptions/plans'),
      apiClient.get('/public/promotions/active'),
    ]).then(([productResult, categoryResult, planResult, promotionResult]) => {
      if (!active) return;

      if (productResult.status === 'fulfilled') {
        const payload = productResult.value.data;
        const nextProducts = Array.isArray(payload) ? payload : payload?.items || payload?.products || [];
        setProducts(nextProducts.filter((item: any) => item?.availability?.isVisible !== false));
      }

      if (categoryResult.status === 'fulfilled') {
        setCategories(Array.isArray(categoryResult.value.data) ? categoryResult.value.data : []);
      }

      if (planResult.status === 'fulfilled') {
        setSubscriptionPlans(Array.isArray(planResult.value.data) ? planResult.value.data : []);
      }

      if (promotionResult.status === 'fulfilled') {
        setPlacements(normalizePromotionPlacements(promotionResult.value.data) as Record<string, Campaign[]>);
      }

      setLoading(false);
    });

    return () => {
      active = false;
    };
  }, []);

  const hero = placements.LANDING_HERO?.[0];
  const landingBanners = placements.LANDING_BANNER || [];
  const featured = useMemo(
    () =>
      [...products]
        .sort((a, b) => Number(Boolean(a?.availability && a.availability?.inStock === false)) - Number(Boolean(b?.availability && b.availability?.inStock === false)))
        .slice(0, 6),
    [products],
  );
  const visibleCategories = categories.slice(0, 5);
  const visiblePlans = subscriptionPlans.slice(0, 3);
  const heroHref = hero?.targetUrl || '';
  const heroHasTarget = Boolean(hero?.targetUrl);

  return (
    <main className="min-h-screen bg-[#f6f8f7] text-[#102522]">
      <header className="relative z-40 border-b border-white/10 bg-[#062d2d] text-white">
        <div className="mx-auto flex h-[58px] max-w-[1440px] items-center gap-5 px-4 sm:px-6 lg:px-9">
          <Link href="/" className="group flex min-w-[150px] items-center gap-2" aria-label="Aagaam home">
            <span className="font-serif text-[29px] font-bold leading-none tracking-[-0.04em] text-white">
              Aagaam
            </span>
            <Leaf className="-ml-3 -mt-5 h-4 w-4 rotate-[-16deg] fill-emerald-400 text-emerald-400" />
            <span className="hidden text-[8px] font-semibold tracking-wide text-emerald-100 xl:block">
              Bringing goodness home
            </span>
          </Link>

          <nav className="hidden items-center gap-7 text-[12px] font-semibold lg:flex">
            <a href="#categories" className="inline-flex items-center gap-1 hover:text-emerald-300">
              Categories <ChevronDown className="h-3 w-3" />
            </a>
            <a href="#subscriptions" className="hover:text-emerald-300">Subscriptions</a>
            <Link href="/shop/deals" className="hover:text-emerald-300">Offers</Link>
            <Link href="/shop" className="hover:text-emerald-300">Store Locator</Link>
            <a href="#about" className="hover:text-emerald-300">About Us</a>
          </nav>

          <Link
            href="/shop"
            className="ml-auto hidden h-9 min-w-0 flex-1 items-center gap-2 rounded-xl bg-white/10 px-4 text-[11px] text-white/60 ring-1 ring-inset ring-white/5 transition hover:bg-white/15 md:flex lg:max-w-[290px]"
          >
            <span className="truncate">Search for fruits, atta, oil...</span>
            <Search className="ml-auto h-4 w-4 text-white/75" />
          </Link>

          <Link
            href="/shop"
            className="hidden min-w-[195px] items-center gap-2 rounded-lg border border-white/15 px-3 py-2 xl:flex"
          >
            <MapPin className="h-4 w-4 text-emerald-300" />
            <span>
              <span className="block text-[8px] text-white/55">Delivering through</span>
              <span className="block max-w-[140px] truncate text-[10px] font-bold">serviceable local stores</span>
            </span>
            <ChevronDown className="ml-auto h-3 w-3 text-white/55" />
          </Link>

          <Link
            href={customerAuthHref('/login', '/shop')}
            className="hidden items-center gap-2 whitespace-nowrap text-[11px] font-semibold sm:flex"
          >
            <UserRound className="h-4 w-4" /> Sign in
          </Link>

          <Link
            href={customerAuthHref('/login', '/shop')}
            className="inline-flex h-9 items-center gap-2 whitespace-nowrap rounded-lg bg-[#18b99c] px-5 text-[11px] font-black text-white shadow-lg shadow-emerald-950/20 transition hover:bg-[#20c8aa]"
          >
            Shop now <ShoppingBag className="h-3.5 w-3.5" />
          </Link>
        </div>
      </header>

      <section
        className="relative isolate overflow-hidden bg-[#072f2e] text-white"
        style={{ backgroundColor: hero?.backgroundColor || '#072f2e', color: hero?.textColor || '#ffffff' }}
      >
        {hero ? <CampaignPicture campaign={hero} /> : null}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(3,35,35,.99)_0%,rgba(3,38,37,.95)_36%,rgba(3,35,35,.58)_54%,rgba(3,35,35,.10)_78%,rgba(3,35,35,.22)_100%)]" />
        {!hero?.imageUrl && !hero?.mobileImageUrl ? (
          <>
            <div className="absolute -right-20 top-[-90px] h-[430px] w-[430px] rounded-full bg-emerald-300/12 blur-3xl" />
            <div className="absolute right-[16%] top-[35%] h-56 w-56 rounded-full bg-amber-300/10 blur-3xl" />
          </>
        ) : null}

        <div className="relative mx-auto flex min-h-[315px] max-w-[1440px] items-center px-4 py-8 sm:px-6 lg:px-16">
          <div className="max-w-[570px]">
            <div className="mb-3 inline-flex items-center gap-1.5 rounded-md border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[10px] font-black text-emerald-200">
              <Leaf className="h-3 w-3 fill-current" />
              {hero?.badgeText || heroFallback.badgeText}
            </div>
            <h1 className="font-serif text-[42px] font-black leading-[0.98] tracking-[-0.035em] sm:text-[48px]">
              {hero?.title || heroFallback.title}
            </h1>
            <p
              className="mt-1 font-serif text-[42px] font-black leading-[0.98] tracking-[-0.035em] text-[#2dd4ae] sm:text-[48px]"
              style={hero?.accentColor ? { color: hero.accentColor } : undefined}
            >
              {hero?.subtitle || heroFallback.subtitle}
            </p>
            <p className="mt-3 max-w-[470px] text-[14px] font-semibold leading-5 text-white/88">
              {hero?.description || heroFallback.description}
            </p>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              {heroHasTarget ? (
                <Link
                  href={heroHref}
                  className="inline-flex h-10 items-center gap-3 rounded-lg px-7 text-[12px] font-black text-white shadow-xl shadow-black/10"
                  style={{ backgroundColor: hero?.accentColor || '#1dbb9d' }}
                >
                  {hero?.ctaLabel || heroFallback.ctaLabel} <ArrowRight className="h-4 w-4" />
                </Link>
              ) : (
                <span
                  className="inline-flex h-10 items-center gap-3 rounded-lg px-7 text-[12px] font-black text-white shadow-xl shadow-black/10 opacity-80"
                  style={{ backgroundColor: hero?.accentColor || '#1dbb9d' }}
                >
                  {hero?.ctaLabel || heroFallback.ctaLabel}
                </span>
              )}
              <Link
                href={customerAuthHref('/login', '/shop/subscriptions')}
                className="inline-flex h-10 items-center rounded-lg border border-white/45 bg-black/10 px-7 text-[12px] font-black text-white backdrop-blur-sm"
              >
                Explore subscriptions
              </Link>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-5 text-[10px] font-bold text-white/85">
              <span className="inline-flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><Truck className="h-3.5 w-3.5 text-emerald-200" /></span>
                Service-area delivery
              </span>
              <span className="h-6 w-px bg-white/18" />
              <span className="inline-flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><Store className="h-3.5 w-3.5 text-emerald-200" /></span>
                Local-store fulfilment
              </span>
              <span className="h-6 w-px bg-white/18" />
              <span className="inline-flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10"><BadgeCheck className="h-3.5 w-3.5 text-emerald-200" /></span>
                Delivery proof
              </span>
            </div>
          </div>
        </div>
      </section>

      <section id="categories" className="bg-white">
        <div className="mx-auto max-w-[1340px] px-4 py-4 sm:px-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-[17px] font-black tracking-[-0.02em]">Shop by category</h2>
            <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black text-emerald-700">
              View all categories <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {visibleCategories.length ? visibleCategories.map((category: any) => {
              const image = categoryImage(category, products);
              const href = `/shop?category=${encodeURIComponent(category.id)}`;
              return (
                <Link
                  key={category.id}
                  href={href}
                  className="group relative h-[94px] overflow-hidden rounded-[9px] bg-[#e9eeeb] shadow-[0_1px_5px_rgba(15,23,42,.08)]"
                >
                  {image ? <img src={image} alt="" className="h-full w-full object-cover transition duration-500 group-hover:scale-105" /> : null}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/10 to-transparent" />
                  <span className="absolute bottom-2 left-3 text-[12px] font-black text-white drop-shadow">{category.name}</span>
                </Link>
              );
            }) : loading ? Array.from({ length: 5 }).map((_, index) => (
              <div key={`placeholder-${index}`} className="h-[94px] animate-pulse rounded-[9px] bg-[#e9eeeb] shadow-[0_1px_5px_rgba(15,23,42,.08)]" />
            )) : (
              <p className="col-span-full py-6 text-center text-sm font-semibold text-slate-400">No categories available.</p>
            )}
          </div>
        </div>
      </section>

      <section className="bg-white">
        <div className="mx-auto max-w-[1340px] px-4 pb-3 sm:px-6">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-black tracking-[-0.02em]">Featured Products</h2>
            <Link href="/shop" className="inline-flex items-center gap-2 text-[10px] font-black text-emerald-700">
              View all products <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {featured.length ? featured.map((product: any, index) => {
              const price = product ? productPrice(product) : 0;
              const mrp = product ? productMrp(product) : 0;
              const discount = product ? productDiscount(product) : 0;
              const image = product ? getProductImage(product) : '';
              const unavailable = Boolean(product?.availability) && product.availability?.inStock === false;
              const returnTo = product?.id ? `/shop/products/${product.id}` : '/shop';

              return (
                <article key={product?.id || index} className="flex min-h-[147px] flex-col rounded-[9px] border border-[#dfe5e2] bg-white p-2.5 shadow-[0_1px_4px_rgba(15,23,42,.03)]">
                  <Link href={product?.id ? `/shop/products/${product.id}` : '/shop'} className="flex h-[65px] items-center justify-center overflow-hidden rounded-md bg-[#fafcfb]">
                    {image ? <img src={image} alt={product?.name || ''} className="h-full w-full object-contain p-1" /> : <ShoppingBag className="h-7 w-7 text-emerald-700/30" />}
                  </Link>
                  <h3 className="mt-1.5 line-clamp-1 text-[10px] font-black text-slate-900">{product?.name || (loading ? 'Loading product...' : 'Product')}</h3>
                  <p className="mt-0.5 line-clamp-1 text-[8px] font-semibold text-slate-400">{product?.category?.name || product?.description || 'Aagaam catalogue'}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1 text-[9px]">
                    <span className="font-black text-slate-950">{product ? formatINR(price) : '—'}</span>
                    {mrp > price ? <span className="text-[8px] text-slate-400 line-through">{formatINR(mrp)}</span> : null}
                    {discount > 0 ? <span className="rounded bg-emerald-50 px-1 py-0.5 text-[7px] font-black text-emerald-700">{discount}% OFF</span> : null}
                  </div>
                  <Link
                    href={customerAuthHref('/login', returnTo)}
                    aria-disabled={unavailable}
                    className={`mt-auto inline-flex h-6 items-center justify-center gap-1 rounded-md text-[8px] font-black text-white ${unavailable ? 'pointer-events-none bg-slate-300' : 'bg-[#0b8d70] hover:bg-[#08775f]'}`}
                  >
                    <ShoppingBag className="h-2.5 w-2.5" /> {unavailable ? 'Unavailable' : 'Add to Cart'}
                  </Link>
                </article>
              );
            }) : loading ? Array.from({ length: 6 }).map((_, index) => (
              <article key={`placeholder-${index}`} className="flex min-h-[147px] flex-col rounded-[9px] border border-[#dfe5e2] bg-white p-2.5 shadow-[0_1px_4px_rgba(15,23,42,.03)] animate-pulse">
                <div className="flex h-[65px] items-center justify-center overflow-hidden rounded-md bg-[#fafcfb]"><ShoppingBag className="h-7 w-7 text-emerald-700/15" /></div>
                <div className="mt-1.5 h-2.5 w-3/4 rounded bg-slate-100" />
                <div className="mt-1 h-2 w-1/2 rounded bg-slate-100" />
                <div className="mt-auto h-6 rounded-md bg-slate-100" />
              </article>
            )) : (
              <p className="col-span-full py-8 text-center text-sm font-semibold text-slate-400">No products available yet.</p>
            )}
          </div>
        </div>
      </section>

      <section id="subscriptions" className="bg-white pb-4 pt-1">
        <div className="mx-auto grid max-w-[1370px] gap-3 px-4 sm:px-6 lg:grid-cols-[205px_1fr_1fr_1fr]">
          <div className="rounded-[10px] bg-[#f4f7f5] p-5">
            <h2 className="text-[18px] font-black">Subscribe &amp; Save</h2>
            <p className="mt-1.5 text-[11px] font-semibold leading-4 text-slate-600">Goodness on repeat. Save time with flexible subscription plans.</p>
            <Link href={customerAuthHref('/login', '/shop/subscriptions')} className="mt-4 inline-flex items-center gap-2 text-[9px] font-black text-emerald-700">
              View all plans <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {(visiblePlans.length ? visiblePlans : loading ? Array.from({ length: 3 }) : []).map((plan: any, index) => {
            const pricePaise = numberFrom(plan?.pricePaise);
            const mrpPaise = Math.max(numberFrom(plan?.mrpPaise), pricePaise);
            const savePct = mrpPaise > pricePaise && mrpPaise > 0 ? Math.round(((mrpPaise - pricePaise) / mrpPaise) * 100) : 0;
            const itemText = plan?.items?.[0]?.product?.name || plan?.items?.[0]?.name || plan?.description || 'Recurring essentials';
            const href = plan?.id ? customerAuthHref('/login', `/shop/subscribe/${plan.id}`) : customerAuthHref('/login', '/shop/subscriptions');

            return (
              <article key={plan?.id || index} className="grid min-h-[115px] grid-cols-[118px_1fr] overflow-hidden rounded-[10px] border border-[#e2e7e4] bg-white shadow-[0_2px_10px_rgba(15,23,42,.04)]">
                <div className="flex items-center justify-center bg-[#f2f6f3]">
                  {plan?.imageUrl || plan?.mobileImageUrl ? (
                    <img src={plan.imageUrl || plan.mobileImageUrl} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <CalendarDays className="h-9 w-9 text-emerald-700/40" />
                  )}
                </div>
                <div className="relative p-3">
                  {savePct > 0 ? <span className="absolute right-2 top-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[7px] font-black text-emerald-700">Save {savePct}%</span> : null}
                  <h3 className="max-w-[75%] line-clamp-1 text-[11px] font-black">{plan?.name || (loading ? 'Loading plan...' : 'Subscription plan')}</h3>
                  <p className="mt-1 line-clamp-1 text-[8px] font-semibold text-slate-500">{itemText}</p>
                  <p className="mt-1 text-[8px] font-semibold text-slate-400">{plan?.totalDeliveries ? `${plan.totalDeliveries} scheduled deliveries` : 'Flexible schedule'}</p>
                  <div className="mt-2 flex items-center gap-1.5">
                    <span className="text-[11px] font-black">{pricePaise ? formatINR(pricePaise / 100) : '—'}</span>
                    {mrpPaise > pricePaise ? <span className="text-[8px] font-bold text-slate-400 line-through">{formatINR(mrpPaise / 100)}</span> : null}
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    <span className="rounded border border-slate-200 px-2 py-1 text-[7px] font-bold text-slate-500">{plan?.totalDeliveries ? `${plan.totalDeliveries} deliveries` : 'Plan'}</span>
                    <Link href={href} className="ml-auto rounded bg-[#0c9375] px-3 py-1.5 text-[7px] font-black text-white">Subscribe now</Link>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section id="about" className="bg-[#073433] text-white">
        <div className="mx-auto grid max-w-[1370px] divide-y divide-white/12 px-4 sm:grid-cols-2 sm:divide-x sm:divide-y-0 sm:px-6 lg:grid-cols-4">
          {trustItems.map((item) => (
            <div key={item.title} className="flex min-h-[70px] items-center gap-4 px-5 py-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 ring-1 ring-inset ring-white/10">
                <item.icon className="h-5 w-5 text-emerald-100" />
              </span>
              <div>
                <h3 className="text-[11px] font-black">{item.title}</h3>
                <p className="mt-1 text-[8px] font-semibold leading-3 text-white/68">{item.copy}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section id="offers" className="bg-[#f6f8f7]">
        <div className="mx-auto grid max-w-[1370px] gap-3 px-4 py-3 sm:px-6 lg:grid-cols-[1.15fr_.85fr]">
          <div className="grid min-h-[92px] grid-cols-[72px_1fr] items-center gap-4 rounded-[10px] bg-white px-5 py-3 shadow-[0_1px_5px_rgba(15,23,42,.05)] sm:grid-cols-[72px_1fr_1fr]">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-emerald-50 text-emerald-700">
              <HeartHandshake className="h-7 w-7" />
            </div>
            <div>
              <p className="text-[9px] font-black uppercase tracking-[.14em] text-emerald-700">Built around the existing platform</p>
              <h2 className="mt-1 text-[15px] font-black">Catalogue, subscriptions, fulfilment and delivery in one journey.</h2>
              <p className="mt-1 text-[9px] font-semibold text-slate-500">This public page reads the same products, categories and subscription plans used by the customer storefront.</p>
            </div>
            <div className="hidden grid-cols-3 gap-2 border-l border-slate-100 pl-4 sm:grid">
              {[
                ['Products', products.length ? `${products.length}+` : 'Live', PackageCheck],
                ['Categories', categories.length ? String(categories.length) : 'Live', Search],
                ['Plans', subscriptionPlans.length ? String(subscriptionPlans.length) : 'Live', CalendarDays],
              ].map(([label, value, Icon]: any) => (
                <div key={label} className="text-center">
                  <Icon className="mx-auto h-4 w-4 text-emerald-600" />
                  <p className="mt-1 text-[16px] font-black">{value}</p>
                  <p className="text-[7px] font-bold text-slate-400">{label}</p>
                </div>
              ))}
            </div>
          </div>

          {landingBanners[0] ? (
            landingBanners[0].targetUrl ? (
              <Link
                href={landingBanners[0].targetUrl!}
                className="group relative min-h-[92px] overflow-hidden rounded-[10px] bg-[#e8f2e9] px-5 py-3"
                style={{ backgroundColor: landingBanners[0].backgroundColor || '#e8f2e9', color: landingBanners[0].textColor || '#17352f' }}
              >
                <CampaignPicture campaign={landingBanners[0]} />
                <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/72 to-transparent" />
                <div className="relative max-w-[58%]">
                  <p className="text-[8px] font-black uppercase tracking-[.14em] text-emerald-700">{landingBanners[0].badgeText || 'Aagaam campaign'}</p>
                  <h2 className="mt-1 line-clamp-1 text-[13px] font-black">{landingBanners[0].title}</h2>
                  <p className="mt-1 line-clamp-2 text-[8px] font-semibold opacity-75">{landingBanners[0].subtitle || landingBanners[0].description}</p>
                  <span className="mt-2 inline-flex items-center gap-1 text-[8px] font-black text-emerald-800">
                    {landingBanners[0].ctaLabel || 'Know more'} <ArrowRight className="h-3 w-3" />
                  </span>
                </div>
              </Link>
            ) : (
              <div
                className="relative min-h-[92px] overflow-hidden rounded-[10px] bg-[#e8f2e9] px-5 py-3"
                style={{ backgroundColor: landingBanners[0].backgroundColor || '#e8f2e9', color: landingBanners[0].textColor || '#17352f' }}
              >
                <CampaignPicture campaign={landingBanners[0]} />
                <div className="absolute inset-0 bg-gradient-to-r from-white/95 via-white/72 to-transparent" />
                <div className="relative max-w-[58%]">
                  <p className="text-[8px] font-black uppercase tracking-[.14em] text-emerald-700">{landingBanners[0].badgeText || 'Aagaam campaign'}</p>
                  <h2 className="mt-1 line-clamp-1 text-[13px] font-black">{landingBanners[0].title}</h2>
                  <p className="mt-1 line-clamp-2 text-[8px] font-semibold opacity-75">{landingBanners[0].subtitle || landingBanners[0].description}</p>
                </div>
              </div>
            )
          ) : (
            <div className="flex min-h-[92px] items-center gap-4 rounded-[10px] bg-[#e8f2e9] px-5 py-3">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-white/75"><Leaf className="h-6 w-6 text-emerald-700" /></span>
              <div>
                <p className="text-[8px] font-black uppercase tracking-[.14em] text-emerald-700">Landing banner placement</p>
                <h2 className="mt-1 text-[13px] font-black">Publish a LANDING BANNER campaign from Admin.</h2>
                <p className="mt-1 text-[8px] font-semibold text-slate-600">The uploaded image and campaign copy will appear here automatically.</p>
              </div>
            </div>
          )}
        </div>
      </section>

      {landingBanners.slice(1).length ? (
        <section className="bg-[#f6f8f7] pb-3">
          <div className="mx-auto grid max-w-[1370px] gap-3 px-4 sm:px-6 md:grid-cols-2">
            {landingBanners.slice(1, 3).map((campaign) => {
              const bannerProps = {
                key: campaign.id,
                className: 'relative min-h-[120px] overflow-hidden rounded-xl p-5',
                style: { backgroundColor: campaign.backgroundColor || '#0b3a36', color: campaign.textColor || '#fff' } as React.CSSProperties,
              };
              const bannerInner = (
                <>
                  <CampaignPicture campaign={campaign} />
                  <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/45 to-transparent" />
                  <div className="relative max-w-[55%]">
                    <p className="text-[8px] font-black uppercase tracking-[.14em] opacity-75">{campaign.badgeText || 'Aagaam'}</p>
                    <h3 className="mt-1 text-[16px] font-black">{campaign.title}</h3>
                    <p className="mt-1 text-[9px] font-semibold opacity-80">{campaign.subtitle || campaign.description}</p>
                  </div>
                </>
              );
              return campaign.targetUrl ? (
                <Link {...bannerProps} href={campaign.targetUrl}>{bannerInner}</Link>
              ) : (
                <div {...bannerProps}>{bannerInner}</div>
              );
            })}
          </div>
        </section>
      ) : null}

      <footer className="bg-[#062d2d] text-white">
        <div className="mx-auto grid max-w-[1370px] gap-7 px-4 py-5 sm:grid-cols-2 sm:px-6 lg:grid-cols-[1.25fr_.75fr_.75fr_1.1fr]">
          <div>
            <Link href="/" className="inline-flex items-center">
              <span className="font-serif text-[25px] font-bold tracking-[-0.04em]">Aagaam</span>
              <Leaf className="-ml-2 -mt-4 h-3.5 w-3.5 fill-emerald-400 text-emerald-400" />
            </Link>
            <p className="mt-2 max-w-[250px] text-[9px] font-semibold leading-4 text-white/65">
              Your local-commerce storefront for fresh groceries, everyday essentials, subscriptions and tracked delivery.
            </p>
            <p className="mt-4 text-[8px] font-bold text-white/45">© 2026 Aagaam. All rights reserved.</p>
          </div>

          <div>
            <h3 className="text-[9px] font-black">Shop</h3>
            <div className="mt-2 grid gap-1 text-[8px] font-semibold text-white/65">
              <Link href="/shop">All products</Link>
              <Link href="/shop/deals">Deals &amp; offers</Link>
              <Link href={customerAuthHref('/login', '/shop/subscriptions')}>Subscriptions</Link>
              <Link href={customerAuthHref('/login', '/shop/orders')}>Orders</Link>
            </div>
          </div>

          <div>
            <h3 className="text-[9px] font-black">Help &amp; Support</h3>
            <div className="mt-2 grid gap-1 text-[8px] font-semibold text-white/65">
              <Link href={customerAuthHref('/login', '/shop/support')}>Customer support</Link>
              <Link href={customerAuthHref('/login', '/shop/addresses')}>Delivery addresses</Link>
              <Link href="/partner">Partner with Aagaam</Link>
              <Link href="/login">Sign in</Link>
            </div>
          </div>

          <div>
            <h3 className="text-[9px] font-black">Continue with Aagaam</h3>
            <p className="mt-2 text-[8px] font-semibold text-white/60">Sign in or create your customer account to add items, subscribe, checkout and track deliveries.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link href={customerAuthHref('/login', '/shop')} className="rounded-md border border-white/20 px-3 py-2 text-[8px] font-black">Sign in</Link>
              <Link href={customerAuthHref('/signup', '/shop')} className="rounded-md bg-[#19b89a] px-3 py-2 text-[8px] font-black">Create account</Link>
            </div>
            <div className="mt-3 flex items-center gap-3 text-[7px] font-bold text-white/45">
              <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Secure checkout</span>
              <span className="inline-flex items-center gap-1"><Clock3 className="h-3 w-3" /> Tracked fulfilment</span>
            </div>
          </div>
        </div>

        <div className="border-t border-white/8">
          <div className="mx-auto flex max-w-[1370px] items-center justify-between px-4 py-2 text-[7px] font-semibold text-white/40 sm:px-6">
            <span>Public landing uses the same Aagaam catalogue APIs.</span>
            <Link href="/shop" className="inline-flex items-center gap-1 text-emerald-200">Open customer shop <ChevronRight className="h-3 w-3" /></Link>
          </div>
        </div>
      </footer>
    </main>
  );
}
