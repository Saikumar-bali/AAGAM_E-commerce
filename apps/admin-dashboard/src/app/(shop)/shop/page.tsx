'use client';

import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { apiClient, getProductImage } from '@aagam/utils';
import { useCart } from '@/hooks/useCart';
import DashboardLayout from '@/components/DashboardLayout';
import { formatINR } from '@/lib/currency';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Minus, 
  X, 
  ShoppingBag,
  Package as PackageIcon,
  SlidersHorizontal
} from 'lucide-react';

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [sort, setSort] = useState('newest');
  const { cart, addToCart, updateQuantity, removeFromCart, totalPrice, totalItems } = useCart();
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

  const filteredProducts = useMemo(() => products, [products]);

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div id="shop" className="min-h-screen font-sans relative">
        <div className="pointer-events-none absolute inset-x-0 -top-8 h-64 bg-gradient-to-b from-emerald-100 via-white to-transparent" />

        {/* Compact Shop Header */}
        <header className="sticky top-0 z-30 -mx-8 -mt-8 mb-6 px-8 pt-8 pb-5 backdrop-blur bg-white/70 border-b border-emerald-100/70">
          <div className="max-w-7xl mx-auto flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-xl font-black text-emerald-700 tracking-tight">Aagam</span>
              <span className="ml-3 hidden sm:inline-flex text-[11px] font-extrabold uppercase tracking-[0.18em] text-emerald-900/60">
                Shop
              </span>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text" 
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search..." 
                  className="pl-10 pr-4 py-2 bg-white/80 border border-emerald-100 rounded-full text-sm focus:ring-2 focus:ring-emerald-400 focus:border-emerald-200 transition-all w-64 shadow-sm"
                />
              </div>
              
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative px-3 py-2 rounded-full border border-emerald-100 bg-white/80 text-emerald-800 hover:bg-emerald-50 transition-colors shadow-sm"
              >
                <span className="inline-flex items-center gap-2">
                  <ShoppingBag className="h-5 w-5" />
                  <span className="hidden sm:inline font-extrabold text-sm">Cart</span>
                </span>
                {totalItems > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-emerald-600 text-white text-[10px] font-black flex items-center justify-center rounded-full border-2 border-white">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto pt-2">
          <div className="mb-5">
            <h1 className="text-2xl font-black text-gray-900">Fresh Groceries</h1>
            <p className="text-gray-600 mt-1 text-sm">Search, browse by category, compare prices, and check out fast.</p>
          </div>

          <div className="mb-6 rounded-2xl border border-emerald-100 bg-white/90 p-4 shadow-sm">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div className="flex items-center gap-2 text-sm font-black text-emerald-900">
                <SlidersHorizontal className="h-4 w-4" />
                Browse smarter
              </div>

              <div className="flex flex-col gap-3 md:flex-row md:items-center">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => setSelectedCategoryId('')}
                    className={`rounded-full px-3 py-1.5 text-xs font-black transition-colors ${
                      selectedCategoryId === '' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    All
                  </button>
                  {categories.map((category) => (
                    <button
                      key={category.id}
                      onClick={() => setSelectedCategoryId(category.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-black transition-colors ${
                        selectedCategoryId === category.id ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                      }`}
                    >
                      {category.name}
                    </button>
                  ))}
                </div>

                <select
                  value={sort}
                  onChange={(e) => setSort(e.target.value)}
                  className="rounded-full border border-emerald-100 bg-white px-4 py-2 text-sm font-bold text-gray-800 outline-none ring-0"
                >
                  <option value="newest">Newest</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                  <option value="name_asc">Name: A to Z</option>
                  <option value="name_desc">Name: Z to A</option>
                </select>
              </div>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(i => (
                <div key={i} className="bg-white/80 rounded-xl h-44 animate-pulse border border-emerald-100"></div>
              ))}
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
              <PackageIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No products found</h3>
              <p className="text-gray-500">Try a different search.</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
              {filteredProducts.map((product) => {
                const qty = qtyById.get(product.id) || 0;
                const price = typeof product.price === 'number' ? product.price : Number(product.price) || 0;
                const productImage = getProductImage(product);
                const cartProduct = { id: product.id, name: product.name, price, image: productImage };

                return (
                  <div key={product.id} className="bg-white/90 rounded-xl border border-emerald-100 overflow-hidden hover:shadow-lg hover:shadow-emerald-900/5 transition-shadow">
                    <div className="aspect-[4/3] bg-emerald-50/50 relative overflow-hidden">
                      <img src={productImage} alt={product.name} className="object-cover w-full h-full" />
                      <div className="absolute top-2 left-2 rounded-full bg-white/90 border border-emerald-100 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-emerald-800">
                        {product.category?.name || 'General'}
                      </div>
                    </div>

                    <div className="p-3">
                      <h3 className="text-[13px] font-extrabold text-gray-900 leading-snug truncate">
                        {product.name}
                      </h3>
                      <div className="mt-2 flex items-end justify-between gap-2">
                        <div className="text-sm font-black text-gray-900">{formatINR(price)}</div>

                        <div className="flex items-center gap-2">
                          <Link
                            href={`/shop/products/${product.id}`}
                            className="h-8 px-3 rounded-full border border-emerald-100 bg-white text-xs font-black text-emerald-900 hover:bg-emerald-50 transition-colors inline-flex items-center"
                          >
                            View
                          </Link>

                          {qty > 0 ? (
                            <div className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50">
                              <button
                                onClick={() => updateQuantity(product.id, qty - 1)}
                                className="h-8 w-8 grid place-items-center text-emerald-800 hover:bg-emerald-100 rounded-full"
                                aria-label="Decrease quantity"
                              >
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-8 text-center text-xs font-black text-emerald-900">{qty}</span>
                              <button
                                onClick={() => updateQuantity(product.id, qty + 1)}
                                className="h-8 w-8 grid place-items-center text-emerald-800 hover:bg-emerald-100 rounded-full"
                                aria-label="Increase quantity"
                              >
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => addToCart(cartProduct)}
                              className="h-8 px-3 rounded-full bg-emerald-700 text-white text-xs font-black hover:bg-emerald-800 transition-colors"
                            >
                              Add
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Cart Drawer Overlay */}
        {isCartOpen && (
          <div className="fixed inset-0 z-50 overflow-hidden">
            <div className="absolute inset-0 bg-gray-900/40 backdrop-blur-sm transition-opacity" onClick={() => setIsCartOpen(false)}></div>
            <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
              <div className="w-screen max-w-md bg-white shadow-2xl flex flex-col">
                <div className="px-6 py-6 border-b border-gray-100 flex items-center justify-between">
                  <h2 className="text-xl font-black text-gray-900 flex items-center">
                    <ShoppingCart className="h-6 w-6 mr-3 text-emerald-600" />
                    Your Cart
                  </h2>
                  <button onClick={() => setIsCartOpen(false)} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
                    <X className="h-6 w-6 text-gray-400" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-4">
                  {cart.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center">
                      <div className="h-20 w-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                        <ShoppingBag className="h-10 w-10 text-gray-200" />
                      </div>
                      <h3 className="text-lg font-black text-gray-900">Your cart is empty</h3>
                      <p className="text-gray-500 mt-1">Add some items to start shopping!</p>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {cart.map((item) => (
                        <div key={item.id} className="flex items-center">
                          <div className="h-16 w-16 bg-emerald-50 rounded-xl overflow-hidden flex-shrink-0 border border-emerald-100">
                            <img src={item.image || getProductImage(item)} alt={item.name} className="w-full h-full object-cover" />
                          </div>
                          <div className="ml-4 flex-1">
                            <div className="flex justify-between items-start gap-3">
                              <h4 className="text-sm font-black text-gray-900 truncate">{item.name}</h4>
                              <button onClick={() => removeFromCart(item.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <p className="text-sm font-black text-emerald-700 mt-1">{formatINR(item.price)}</p>
                            <div className="flex items-center mt-3 bg-emerald-50 w-fit rounded-full border border-emerald-100">
                              <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="h-8 w-8 grid place-items-center hover:bg-emerald-100 rounded-full text-emerald-800">
                                <Minus className="h-4 w-4" />
                              </button>
                              <span className="w-8 text-center text-xs font-black text-emerald-900">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="h-8 w-8 grid place-items-center hover:bg-emerald-100 rounded-full text-emerald-800">
                                <Plus className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="border-t border-gray-100 p-6 bg-gradient-to-b from-white to-emerald-50">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-gray-600 font-bold">Subtotal</span>
                      <span className="text-2xl font-black text-gray-900">{formatINR(totalPrice)}</span>
                    </div>
                    <button
                      onClick={() => {
                        setIsCartOpen(false);
                        router.push('/shop/checkout');
                      }}
                      className="w-full bg-emerald-700 text-white py-4 rounded-2xl font-black hover:bg-emerald-800 transition-colors shadow-lg shadow-emerald-900/10"
                    >
                      Checkout Now
                    </button>
                    <p className="text-center text-[10px] text-emerald-900/50 mt-4 uppercase tracking-widest font-black">Free delivery on your first order</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
