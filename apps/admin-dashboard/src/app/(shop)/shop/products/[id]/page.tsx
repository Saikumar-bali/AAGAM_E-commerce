'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Minus, Plus, ShoppingBag, Heart, Clock, ShieldCheck, Truck, Star, Store } from 'lucide-react';
import { apiClient, getProductImage } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import ProductCard from '@/components/customer/ProductCard';
import { useCart } from '@/hooks/useCart';
import { useWishlist } from '@/hooks/useWishlist';
import { formatINR } from '@/lib/currency';

const DETAIL_SECTIONS = [
  { title: 'Highlights', fields: [
    ['brand', 'Brand'], ['productType', 'Product type'], ['flavour', 'Flavour'], ['materialTypeFree', 'Material type free'], ['keyFeatures', 'Key features'], ['itemForm', 'Item form'],
    ['ingredients', 'Ingredients'], ['allergenInformation', 'Allergen information'], ['fssaiLicense', 'FSSAI license'], ['nutritionInformation', 'Nutrition information'], ['dietaryPreference', 'Dietary preference'],
    ['spiceLevel', 'Spice level'], ['cuisineType', 'Cuisine type'], ['packagingType', 'Packaging type'], ['storageInstruction', 'Storage instruction'], ['isPerishable', 'Is perishable'], ['servingSize', 'Serving size'], ['weight', 'Weight'], ['unit', 'Unit'],
  ] },
  { title: 'Information', fields: [
    ['disclaimer', 'Disclaimer'], ['customerCareDetails', 'Customer care details'], ['sellerName', 'Seller name'], ['sellerAddress', 'Seller address'], ['sellerLicenseNo', 'Seller license no.'],
    ['manufacturerOrMarketerName', 'Manufacturer or marketer name'], ['countryOfOrigin', 'Country of origin'], ['shelfLife', 'Shelf life'],
  ] },
] as const;

function splitImageInput(value: unknown) {
  if (Array.isArray(value)) return value;
  return String(value || '').split(/[\n,]+/);
}

function getGalleryImages(product: any, fallbackImage: string) {
  const details = product?.details && typeof product.details === 'object' ? product.details : {};
  const gallery = splitImageInput(details.galleryImages);
  const rootGallery = splitImageInput(product?.images);
  return Array.from(new Set([fallbackImage, product?.image, ...rootGallery, ...gallery].map((item) => String(item || '').trim()).filter(Boolean)));
}

function ProductDetailSections({ details }: { details?: Record<string, string> | null }) {
  const safeDetails: Record<string, string> = details && typeof details === 'object' ? details : {};
  const hasAny = DETAIL_SECTIONS.some((section) => section.fields.some(([key]) => Boolean(String(safeDetails[key] || '').trim())));
  if (!hasAny) return null;
  return <div className="rounded-3xl border border-slate-100 bg-white p-5 shadow-sm md:p-6">{DETAIL_SECTIONS.map((section) => { const rows = section.fields.map(([key, label]) => ({ key, label, value: String(safeDetails[key] || '').trim() })).filter((row) => row.value); if (!rows.length) return null; return <section key={section.title} className="border-b border-slate-100 py-5 first:pt-0 last:border-0 last:pb-0"><h2 className="mb-4 text-lg font-black text-slate-950">{section.title}</h2><dl className="grid gap-x-8 gap-y-5 md:grid-cols-[220px_1fr]">{rows.map((row) => <React.Fragment key={row.key}><dt className="text-sm font-bold capitalize text-slate-500">{row.label}</dt><dd className="whitespace-pre-line text-sm font-semibold leading-6 text-slate-950">{row.value}</dd></React.Fragment>)}</dl></section>; })}</div>;
}

function ProductImageGallery({ product, images, activeImage, onSelect, wished, onToggleWish }: { product: any; images: string[]; activeImage: string; onSelect: (image: string) => void; wished: boolean; onToggleWish: () => void }) {
  return <div className="bg-white p-4 lg:p-6"><div className="grid gap-4 md:grid-cols-[76px_1fr]"><div className="order-2 flex gap-3 overflow-x-auto pb-1 md:order-1 md:max-h-[560px] md:flex-col md:overflow-y-auto md:pb-0 md:pr-1">{images.map((image, index) => <button key={`${image}-${index}`} onClick={() => onSelect(image)} className={`grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl border bg-white p-1 transition-all md:h-[72px] md:w-[72px] ${activeImage === image ? 'border-slate-950 shadow-lg shadow-slate-200' : 'border-slate-200 hover:border-teal-500'}`}><img src={image} alt={`${product.name} view ${index + 1}`} className="h-full w-full object-contain" /></button>)}</div><div className="relative order-1 grid min-h-[340px] place-items-center rounded-3xl border border-slate-100 bg-white md:order-2 lg:min-h-[560px]"><img src={activeImage} alt={product.name} className="max-h-[320px] w-full object-contain p-5 lg:max-h-[540px]" />{product.category?.name && <div className="absolute left-4 top-4 rounded-xl border border-slate-100 bg-white/90 px-3 py-1.5 text-xs font-black uppercase tracking-wider text-teal-800 backdrop-blur-sm">{product.category.name}</div>}<button onClick={onToggleWish} className={`absolute right-4 top-4 grid h-10 w-10 place-items-center rounded-xl border backdrop-blur-sm transition-all ${wished ? 'bg-rose-100 border-rose-200 text-rose-500' : 'bg-white/90 border-slate-200 text-slate-400 hover:text-rose-400'}`}><Heart className={`h-5 w-5 ${wished ? 'fill-current' : ''}`} /></button></div></div></div>;
}

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const router = useRouter();
  const [product, setProduct] = useState<any | null>(null);
  const [related, setRelated] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState('');
  const { cart, addToCart, updateQuantity, totalItems, totalPrice } = useCart();
  const wishlist = useWishlist();

  useEffect(() => {
    if (!productId) return;
    let active = true;
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get(`/products/${productId}`, { params: { includeAvailability: true } });
        if (!active) return;
        const nextProduct = response.data;
        setProduct(nextProduct);
        const categoryId = nextProduct?.categoryId || nextProduct?.category?.id;
        if (categoryId) {
          const relatedResponse = await apiClient.get('/products', { params: { categoryId, pageSize: 8 } });
          const items = Array.isArray(relatedResponse.data) ? relatedResponse.data : relatedResponse.data?.items || [];
          if (active) setRelated(items.filter((item: any) => item.id !== productId).slice(0, 6));
        } else if (active) setRelated([]);
      } catch (err: any) {
        if (active) setError(err?.response?.data?.message || 'Failed to load product');
      } finally {
        if (active) setLoading(false);
      }
    };
    fetchProduct();
    return () => { active = false; };
  }, [productId]);

  const qtyById = useMemo(() => { const map = new Map<string, number>(); for (const item of cart) map.set(item.id, item.quantity); return map; }, [cart]);
  const qty = product ? qtyById.get(product.id) || 0 : 0;
  const productImage = product ? getProductImage(product) : '';
  const galleryImages = useMemo(() => product ? getGalleryImages(product, productImage) : [], [product, productImage]);
  useEffect(() => { if (galleryImages.length) setSelectedImage((current) => galleryImages.includes(current) ? current : galleryImages[0]); }, [galleryImages]);
  const activeImage = selectedImage || productImage;
  const price = product ? Number(product.price) || 0 : 0;
  const inStock = product?.availability?.inStock ?? true;
  const wished = product ? wishlist.has(product.id) : false;

  return <DashboardLayout allowedRole="CUSTOMER"><div className="mx-auto max-w-6xl space-y-6 pb-32 md:pb-10"><button onClick={() => router.back()} className="mb-1 inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 transition-colors hover:bg-slate-50"><ArrowLeft className="h-4 w-4" />Back</button>{loading ? <div className="rounded-3xl border border-slate-100 bg-white p-6 animate-pulse"><div className="grid gap-6 lg:grid-cols-2"><div className="aspect-square rounded-2xl bg-slate-100" /><div className="space-y-4"><div className="h-4 w-24 rounded bg-slate-100" /><div className="h-8 w-3/4 rounded bg-slate-100" /><div className="h-4 w-full rounded bg-slate-100" /><div className="h-10 w-32 rounded bg-slate-100" /></div></div></div> : error ? <div className="rounded-3xl border border-red-100 bg-red-50 p-8 text-center"><p className="text-sm font-bold text-red-700">{error}</p><button onClick={() => router.push('/shop')} className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-sm font-black text-white">Back to shop</button></div> : !product ? <div className="rounded-3xl border border-slate-100 bg-white p-8 text-center"><p className="text-sm text-slate-500">Product not found.</p></div> : <><div className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm"><div className="grid gap-0 lg:grid-cols-[1.08fr_0.92fr]"><ProductImageGallery product={product} images={galleryImages} activeImage={activeImage} onSelect={setSelectedImage} wished={wished} onToggleWish={() => wishlist.toggle({ id: product.id, name: product.name, price })} /><div className="flex flex-col border-t border-slate-100 p-6 lg:border-l lg:border-t-0 lg:p-8"><div className="mb-2 flex items-center gap-3"><div className="flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-0.5"><Star className="h-3 w-3 fill-current text-amber-500" /><span className="text-xs font-black text-amber-700">Popular</span></div><div className="flex items-center gap-1 rounded-lg border border-teal-200 bg-teal-50 px-2 py-0.5"><Clock className="h-3 w-3 text-teal-600" /><span className="text-xs font-black text-teal-700">10 min</span></div></div><h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 lg:text-3xl">{product.name}</h1><p className="mt-3 text-sm font-semibold leading-6 text-slate-500">{product.description || 'Freshly stocked and ready for a fast doorstep delivery.'}</p><div className="mt-6 rounded-2xl bg-gradient-to-br from-slate-950 to-slate-800 p-5"><div className="text-xs font-black uppercase tracking-wider text-slate-400">Price</div><div className="mt-2 text-3xl font-black text-white">{formatINR(price)}</div><div className="mt-3 flex flex-wrap items-center gap-3"><span className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-black ${inStock ? 'bg-teal-500/20 text-teal-300' : 'bg-red-500/20 text-red-300'}`}><span className={`h-1.5 w-1.5 rounded-full ${inStock ? 'bg-teal-400' : 'bg-red-400'}`} />{inStock ? 'In stock' : 'Out of stock'}</span>{product.availability?.storeName && <span className="flex items-center gap-1 text-xs font-bold text-slate-400"><Store className="h-3 w-3" />{product.availability.storeName}</span>}</div></div><div className="mt-5 flex flex-wrap gap-3">{qty > 0 ? <div className="inline-flex items-center rounded-xl border-2 border-teal-200 bg-teal-50"><button onClick={() => updateQuantity(product.id, qty - 1)} className="grid h-12 w-12 place-items-center rounded-l-xl text-teal-800 transition-colors hover:bg-teal-100"><Minus className="h-5 w-5" /></button><span className="w-12 text-center text-lg font-black text-teal-900">{qty}</span><button onClick={() => updateQuantity(product.id, qty + 1)} className="grid h-12 w-12 place-items-center rounded-r-xl text-teal-800 transition-colors hover:bg-teal-100"><Plus className="h-5 w-5" /></button></div> : <button onClick={() => inStock && addToCart({ id: product.id, name: product.name, price, image: activeImage })} disabled={!inStock} className="inline-flex h-12 items-center gap-2 rounded-xl bg-teal-700 px-6 text-sm font-black text-white shadow-lg shadow-teal-900/15 transition-all hover:-translate-y-0.5 hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300"><ShoppingBag className="h-4 w-4" />Add to cart</button>}<button onClick={() => wishlist.toggle({ id: product.id, name: product.name, price })} className={`inline-flex h-12 items-center gap-2 rounded-xl border-2 px-5 text-sm font-black transition-all ${wished ? 'border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white text-slate-600 hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500'}`}><Heart className={`h-4 w-4 ${wished ? 'fill-current' : ''}`} />{wished ? 'Saved' : 'Save'}</button></div><div className="mt-auto grid grid-cols-2 gap-3 pt-6">{[{ icon: Truck, label: 'Fast delivery', sub: 'Nearby stores' }, { icon: ShieldCheck, label: 'Quality assured', sub: 'Fresh stock' }].map((item) => <div key={item.label} className="flex items-center gap-2.5 rounded-xl border border-slate-100 bg-slate-50 px-3 py-2.5"><item.icon className="h-4 w-4 shrink-0 text-teal-600" /><div><div className="text-xs font-black text-slate-900">{item.label}</div><div className="text-[10px] font-bold text-slate-400">{item.sub}</div></div></div>)}</div></div></div></div><ProductDetailSections details={product.details} /></>}{related.length > 0 && <section><div className="mb-3 flex items-center justify-between"><h2 className="text-lg font-black text-slate-950">You may also like</h2><Link href="/shop" className="text-sm font-black text-teal-700">View all</Link></div><div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">{related.map((item) => { const itemQty = qtyById.get(item.id) || 0; const itemPrice = Number(item.price) || 0; return <ProductCard key={item.id} product={item} qty={itemQty} wished={wishlist.has(item.id)} onAdd={() => addToCart({ id: item.id, name: item.name, price: itemPrice, image: getProductImage(item) })} onIncrement={() => updateQuantity(item.id, itemQty + 1)} onDecrement={() => updateQuantity(item.id, itemQty - 1)} onToggleWish={() => wishlist.toggle({ id: item.id, name: item.name, price: itemPrice })} />; })}</div></section>}{totalItems > 0 && <div className="fixed inset-x-0 bottom-4 z-40 px-4 pointer-events-none md:mx-auto md:max-w-5xl md:px-0"><div className="pointer-events-auto flex items-center justify-between rounded-2xl bg-slate-950 px-5 py-3.5 shadow-2xl shadow-slate-950/30"><div className="flex items-center gap-3"><div className="flex items-center gap-1 rounded-xl bg-white/10 px-3 py-1.5 text-xs font-black text-white"><ShoppingBag className="h-3.5 w-3.5" />{totalItems} item{totalItems !== 1 ? 's' : ''}</div><span className="text-lg font-black text-white">{formatINR(totalPrice)}</span></div><button onClick={() => router.push('/shop/checkout')} className="rounded-xl bg-teal-600 px-5 py-2.5 text-sm font-black text-white shadow-lg shadow-teal-900/20 transition-all hover:bg-teal-500">Checkout →</button></div></div>}</div></DashboardLayout>;
}
