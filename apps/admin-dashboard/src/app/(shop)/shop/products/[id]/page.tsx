'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowLeft, Minus, Package, Plus, ShoppingBag } from 'lucide-react';
import { apiClient } from '@aagam/utils';
import DashboardLayout from '@/components/DashboardLayout';
import { useCart } from '@/hooks/useCart';
import { formatINR } from '@/lib/currency';

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = params?.id;
  const [product, setProduct] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { cart, addToCart, updateQuantity } = useCart();

  useEffect(() => {
    if (!productId) return;
    const fetchProduct = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiClient.get(`/products/${productId}`);
        setProduct(response.data);
      } catch (err: any) {
        setError(err?.response?.data?.message || 'Failed to load product');
      } finally {
        setLoading(false);
      }
    };
    fetchProduct();
  }, [productId]);

  const qty = useMemo(() => {
    const match = cart.find((item) => item.id === product?.id);
    return match?.quantity || 0;
  }, [cart, product?.id]);

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="max-w-6xl mx-auto">
        <Link href="/shop" className="inline-flex items-center gap-2 text-emerald-900 font-black">
          <ArrowLeft className="h-4 w-4" />
          Back to shop
        </Link>

        <div className="mt-6 rounded-[2rem] border border-emerald-100 bg-white p-6 shadow-sm">
          {loading ? (
            <div className="text-sm text-gray-600">Loading product...</div>
          ) : error ? (
            <div className="text-sm font-bold text-red-700">{error}</div>
          ) : !product ? (
            <div className="text-sm text-gray-600">Product not found.</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-2">
              <div className="overflow-hidden rounded-[1.5rem] border border-emerald-100 bg-emerald-50/40">
                {product.image ? (
                  <img src={product.image} alt={product.name} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex min-h-[360px] items-center justify-center">
                    <Package className="h-20 w-20 text-emerald-200" />
                  </div>
                )}
              </div>

              <div>
                <div className="text-xs font-black uppercase tracking-[0.2em] text-emerald-700">
                  {product.category?.name || 'General'}
                </div>
                <h1 className="mt-3 text-4xl font-black text-gray-900">{product.name}</h1>
                <p className="mt-4 text-sm leading-7 text-gray-600">
                  {product.description || 'Freshly stocked and ready for a fast doorstep delivery.'}
                </p>

                <div className="mt-6 rounded-2xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.18em] text-emerald-900/60">Price</div>
                  <div className="mt-2 text-3xl font-black text-gray-900">{formatINR(Number(product.price) || 0)}</div>
                  {product.availability ? (
                    <div className="mt-4 text-sm text-gray-700">
                      <div>
                        Stock:{' '}
                        <span className={`font-black ${product.availability.inStock ? 'text-emerald-700' : 'text-red-600'}`}>
                          {product.availability.inStock ? 'In stock' : 'Out of stock'}
                        </span>
                      </div>
                      {product.availability.storeName ? (
                        <div className="mt-1">Nearest store: <span className="font-black text-gray-900">{product.availability.storeName}</span></div>
                      ) : null}
                    </div>
                  ) : null}
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3">
                  {qty > 0 ? (
                    <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50">
                      <button
                        onClick={() => updateQuantity(product.id, qty - 1)}
                        className="h-11 w-11 grid place-items-center rounded-full text-emerald-800 hover:bg-emerald-100"
                        aria-label="Decrease quantity"
                      >
                        <Minus className="h-4 w-4" />
                      </button>
                      <span className="w-10 text-center text-sm font-black text-emerald-900">{qty}</span>
                      <button
                        onClick={() => updateQuantity(product.id, qty + 1)}
                        className="h-11 w-11 grid place-items-center rounded-full text-emerald-800 hover:bg-emerald-100"
                        aria-label="Increase quantity"
                      >
                        <Plus className="h-4 w-4" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => addToCart({ id: product.id, name: product.name, price: Number(product.price) || 0, image: product.image })}
                      className="inline-flex h-11 items-center gap-2 rounded-full bg-emerald-700 px-5 text-sm font-black text-white hover:bg-emerald-800"
                    >
                      <ShoppingBag className="h-4 w-4" />
                      Add to cart
                    </button>
                  )}

                  <Link
                    href="/shop/checkout"
                    className="inline-flex h-11 items-center rounded-full border border-emerald-100 bg-white px-5 text-sm font-black text-emerald-900 hover:bg-emerald-50"
                  >
                    Go to checkout
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </DashboardLayout>
  );
}
