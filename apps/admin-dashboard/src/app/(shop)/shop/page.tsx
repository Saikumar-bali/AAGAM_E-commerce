'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from '@aagam/utils';
import { useCart } from '@/hooks/useCart';
import DashboardLayout from '@/components/DashboardLayout';
import { 
  ShoppingCart, 
  Search, 
  Plus, 
  Minus, 
  X, 
  ShoppingBag,
  LogOut,
  User,
  Package as PackageIcon
} from 'lucide-react';

export default function ShopPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const { cart, addToCart, updateQuantity, removeFromCart, totalPrice, totalItems } = useCart();
  const router = useRouter();

  useEffect(() => {
    const fetchProducts = async () => {
      try {
        const response = await apiClient.get('/products');
        setProducts(response.data);
      } catch (error) {
        console.error('Failed to fetch products', error);
      } finally {
        setLoading(false);
      }
    };
    fetchProducts();
  }, []);

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      localStorage.clear();
      router.push('/login');
    }
  };

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="min-h-screen bg-gray-50 font-sans">
        {/* Header - Integrated into the layout but maintaining the custom shop header style */}
        <header className="bg-white border-b border-gray-200 sticky top-0 z-30 -mx-8 -mt-8 mb-8 px-8">
          <div className="max-w-7xl mx-auto flex justify-between items-center h-16">
            <div className="flex items-center">
              <span className="text-2xl font-bold text-emerald-600">Aagam</span>
              <nav className="ml-10 hidden md:flex space-x-8">
                <a href="#" className="text-gray-900 font-medium">Grocery</a>
                <a href="#" className="text-gray-500 hover:text-gray-900 font-medium transition-colors">Electronics</a>
                <a href="#" className="text-gray-500 hover:text-gray-900 font-medium transition-colors">Household</a>
              </nav>
            </div>

            <div className="flex items-center space-x-4">
              <div className="relative hidden sm:block">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input 
                  type="text" 
                  placeholder="Search products..." 
                  className="pl-10 pr-4 py-2 bg-gray-100 border-none rounded-full text-sm focus:ring-2 focus:ring-emerald-500 transition-all w-64"
                />
              </div>
              
              <button 
                onClick={() => setIsCartOpen(true)}
                className="relative p-2 text-gray-600 hover:text-emerald-600 transition-colors"
              >
                <ShoppingBag className="h-6 w-6" />
                {totalItems > 0 && (
                  <span className="absolute top-0 right-0 h-5 w-5 bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full border-2 border-white">
                    {totalItems}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto">
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900">Fresh Groceries</h1>
            <p className="text-gray-500 mt-2">Delivered to your door in minutes.</p>
          </div>

          {loading ? (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {[1, 2, 4, 5, 6, 7, 8].map(i => (
                <div key={i} className="bg-white rounded-2xl h-64 animate-pulse border border-gray-100"></div>
              ))}
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-dashed border-gray-300">
              <PackageIcon className="h-12 w-12 text-gray-300 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900">No products found</h3>
              <p className="text-gray-500">The store is currently being stocked. Check back soon!</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
              {products.map((product) => (
                <div key={product.id} className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-xl hover:shadow-emerald-900/5 transition-all group">
                  <div className="aspect-square bg-gray-50 relative overflow-hidden">
                    {product.image ? (
                      <img src={product.image} alt={product.name} className="object-cover w-full h-full group-hover:scale-110 transition-transform duration-500" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PackageIcon className="h-12 w-12 text-gray-200" />
                      </div>
                    )}
                    <button 
                      onClick={() => addToCart(product)}
                      className="absolute bottom-3 right-3 h-10 w-10 bg-white shadow-lg rounded-xl flex items-center justify-center text-emerald-600 hover:bg-emerald-600 hover:text-white transition-all transform translate-y-2 opacity-0 group-hover:translate-y-0 group-hover:opacity-100"
                    >
                      <Plus className="h-6 w-6" />
                    </button>
                  </div>
                  <div className="p-4">
                    <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-widest">{product.category?.name || 'General'}</span>
                    <h3 className="text-sm font-bold text-gray-900 mt-1 line-clamp-1">{product.name}</h3>
                    <p className="text-lg font-black text-gray-900 mt-2">${product.price.toFixed(2)}</p>
                  </div>
                </div>
              ))}
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
                  <h2 className="text-xl font-bold text-gray-900 flex items-center">
                    <ShoppingCart className="h-6 w-6 mr-3 text-emerald-500" />
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
                      <h3 className="text-lg font-bold text-gray-900">Your cart is empty</h3>
                      <p className="text-gray-500 mt-1">Add some items to start shopping!</p>
                    </div>
                  ) : (
                    <div className="space-y-6">
                      {cart.map((item) => (
                        <div key={item.id} className="flex items-center">
                          <div className="h-20 w-20 bg-gray-50 rounded-xl overflow-hidden flex-shrink-0">
                            {item.image ? (
                              <img src={item.image} alt={item.name} className="w-full h-full object-cover" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center">
                                <PackageIcon className="h-8 w-8 text-gray-200" />
                              </div>
                            )}
                          </div>
                          <div className="ml-4 flex-1">
                            <div className="flex justify-between items-start">
                              <h4 className="text-sm font-bold text-gray-900">{item.name}</h4>
                              <button onClick={() => removeFromCart(item.id)} className="text-gray-400 hover:text-red-500 transition-colors">
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <p className="text-sm font-bold text-emerald-600 mt-1">${item.price.toFixed(2)}</p>
                            <div className="flex items-center mt-3 bg-gray-50 w-fit rounded-lg border border-gray-100">
                              <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="p-1.5 hover:bg-gray-200 rounded-l-lg text-gray-500">
                                <Minus className="h-3 w-3" />
                              </button>
                              <span className="w-8 text-center text-xs font-bold text-gray-900">{item.quantity}</span>
                              <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="p-1.5 hover:bg-gray-200 rounded-r-lg text-gray-500">
                                <Plus className="h-3 w-3" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {cart.length > 0 && (
                  <div className="border-t border-gray-100 p-6 bg-gray-50">
                    <div className="flex justify-between items-center mb-4">
                      <span className="text-gray-500 font-medium">Subtotal</span>
                      <span className="text-2xl font-black text-gray-900">${totalPrice.toFixed(2)}</span>
                    </div>
                    <button className="w-full bg-emerald-600 text-white py-4 rounded-2xl font-bold hover:bg-emerald-700 transition-colors shadow-lg shadow-emerald-900/10">
                      Checkout Now
                    </button>
                    <p className="text-center text-[10px] text-gray-400 mt-4 uppercase tracking-widest font-bold">Free delivery on your first order</p>
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
