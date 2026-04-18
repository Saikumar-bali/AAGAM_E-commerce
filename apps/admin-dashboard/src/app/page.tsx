'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  ShoppingBag, 
  Search, 
  MapPin, 
  ChevronRight, 
  Clock, 
  ShieldCheck, 
  Zap,
  ArrowRight,
  Star,
  Plus
} from 'lucide-react';
import { apiClient } from '@aagam/utils';

export default function LandingPage() {
  const [products, setProducts] = useState<any[]>([]);
  const [isScrolled, setIsScrolled] = useState(false);
  const router = useRouter();

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    
    // Fetch some featured products
    apiClient.get('/products').then(res => setProducts(res.data.slice(0, 4))).catch(() => {});
    
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <div className="min-h-screen bg-white text-gray-900 font-sans">
      {/* Navigation */}
      <nav className={`fixed w-full z-50 transition-all duration-300 ${isScrolled ? 'bg-white shadow-md py-3' : 'bg-transparent py-5'}`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-8">
            <Link href="/" className="text-3xl font-black tracking-tighter text-emerald-600">
              AAGAM
            </Link>
            <div className="hidden md:flex items-center space-x-2 text-sm font-medium text-gray-600 bg-gray-100 px-3 py-1.5 rounded-full">
              <MapPin className="h-4 w-4 text-emerald-500" />
              <span>Delivering to </span>
              <span className="text-gray-900 font-bold border-b border-dotted border-gray-400">Bangalore</span>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <Link href="/login" className="text-sm font-bold hover:text-emerald-600 transition-colors">
              Sign In
            </Link>
            <Link 
              href="/signup" 
              className="bg-gray-900 text-white px-6 py-2.5 rounded-full text-sm font-bold hover:bg-emerald-600 transition-all shadow-lg shadow-gray-200"
            >
              Sign Up
            </Link>
            <button className="bg-emerald-100 text-emerald-700 p-2.5 rounded-full hover:bg-emerald-200 transition-colors relative group">
              <ShoppingBag className="h-5 w-5" />
              <span className="absolute -top-1 -right-1 h-4 w-4 bg-emerald-600 text-white text-[10px] flex items-center justify-center rounded-full border-2 border-white">0</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative pt-32 pb-20 lg:pt-48 lg:pb-32 overflow-hidden">
        <div className="absolute top-0 right-0 -mr-20 -mt-20 w-1/2 h-full bg-emerald-50 rounded-full blur-3xl opacity-50 -z-10 animate-pulse"></div>
        
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="lg:grid lg:grid-cols-2 lg:gap-16 items-center">
            <div className="mb-12 lg:mb-0">
              <div className="inline-flex items-center space-x-2 bg-emerald-50 text-emerald-700 px-4 py-2 rounded-full mb-6">
                <Zap className="h-4 w-4 fill-emerald-500" />
                <span className="text-xs font-black uppercase tracking-wider">Fastest Delivery in Town</span>
              </div>
              <h1 className="text-6xl lg:text-8xl font-black text-gray-900 leading-[0.9] tracking-tighter mb-8">
                GROCERIES <br/>
                <span className="text-emerald-600">IN 10 MINS.</span>
              </h1>
              <p className="text-xl text-gray-500 max-w-md mb-10 leading-relaxed font-medium">
                Everything you need, delivered before you can finish your coffee. No delivery slots, no waiting.
              </p>
              
              <div className="relative max-w-lg group">
                <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-6 w-6 text-gray-400 group-focus-within:text-emerald-500 transition-colors" />
                <input 
                  type="text" 
                  placeholder="Search 'milk', 'eggs', 'chips'..." 
                  className="w-full pl-14 pr-40 py-6 bg-white border-2 border-gray-100 rounded-3xl text-lg shadow-2xl shadow-gray-200 focus:outline-none focus:border-emerald-500 transition-all"
                />
                <button className="absolute right-3 top-3 bottom-3 bg-emerald-600 text-white px-8 rounded-2xl font-black hover:bg-emerald-700 transition-all">
                  FIND
                </button>
              </div>

              <div className="mt-12 flex items-center space-x-8">
                <div className="flex -space-x-3">
                  {[1,2,3,4].map(i => (
                    <div key={i} className="h-12 w-12 rounded-full border-4 border-white bg-gray-200 overflow-hidden">
                      <img src={`https://i.pravatar.cc/100?u=${i}`} alt="user" />
                    </div>
                  ))}
                </div>
                <div>
                  <div className="flex text-yellow-400">
                    {[1,2,3,4,5].map(i => <Star key={i} className="h-4 w-4 fill-current" />)}
                  </div>
                  <p className="text-sm font-bold text-gray-900 mt-1">10k+ Happy Customers</p>
                </div>
              </div>
            </div>

            <div className="relative">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-4 pt-12">
                  <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 transform hover:-translate-y-2 transition-transform">
                    <div className="h-40 bg-gray-50 rounded-2xl mb-4 overflow-hidden">
                      <img src="https://images.unsplash.com/photo-1550989460-0adf9ea622e2?w=400&q=80" className="object-cover w-full h-full" alt="grocery" />
                    </div>
                    <h3 className="font-bold">Fresh Fruits</h3>
                    <p className="text-sm text-gray-500 mt-1">From farm to you</p>
                  </div>
                  <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 transform hover:-translate-y-2 transition-transform">
                    <div className="h-32 bg-emerald-600 rounded-2xl flex items-center justify-center p-6 text-white">
                      <div className="text-center">
                        <p className="text-3xl font-black">20%</p>
                        <p className="text-xs font-bold uppercase tracking-widest">OFF FIRST ORDER</p>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="space-y-4">
                  <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 transform hover:-translate-y-2 transition-transform">
                    <div className="h-32 bg-gray-900 rounded-2xl flex items-center justify-center p-6 text-white relative overflow-hidden">
                       <Zap className="absolute -right-2 -bottom-2 h-20 w-20 text-white/10" />
                       <div className="text-center relative z-10">
                        <p className="text-sm font-bold">EXPRESS</p>
                        <p className="text-xl font-black tracking-tighter">10 MIN DELIVERY</p>
                      </div>
                    </div>
                  </div>
                  <div className="bg-white p-4 rounded-3xl shadow-xl border border-gray-100 transform hover:-translate-y-2 transition-transform">
                    <div className="h-48 bg-gray-50 rounded-2xl mb-4 overflow-hidden">
                       <img src="https://images.unsplash.com/photo-1542838132-92c53300491e?w=400&q=80" className="object-cover w-full h-full" alt="grocery" />
                    </div>
                    <h3 className="font-bold">Organic Veggies</h3>
                    <p className="text-sm text-gray-500 mt-1">Certified quality</p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
            <div className="flex items-start">
              <div className="h-14 w-14 bg-emerald-100 rounded-2xl flex items-center justify-center flex-shrink-0 mr-6">
                <Clock className="h-7 w-7 text-emerald-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Instant Delivery</h3>
                <p className="text-gray-500 leading-relaxed">Average delivery time is 9 minutes. We are faster than your hunger.</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="h-14 w-14 bg-blue-100 rounded-2xl flex items-center justify-center flex-shrink-0 mr-6">
                <ShieldCheck className="h-7 w-7 text-blue-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">Quality Assured</h3>
                <p className="text-gray-500 leading-relaxed">Strict quality checks for every item. If it's not fresh, it's not Aagam.</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="h-14 w-14 bg-purple-100 rounded-2xl flex items-center justify-center flex-shrink-0 mr-6">
                <ShoppingBag className="h-7 w-7 text-purple-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold mb-2">No Min. Order</h3>
                <p className="text-gray-500 leading-relaxed">Need just a single egg or a loaf of bread? We've got you covered.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-emerald-600 rounded-[3rem] p-12 lg:p-20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-1/2 h-full bg-white/5 skew-x-12 -mr-20"></div>
            <div className="relative z-10 lg:grid lg:grid-cols-2 lg:gap-10 items-center">
              <div>
                <h2 className="text-4xl lg:text-6xl font-black text-white leading-none mb-8">
                  READY TO EXPERIENCE <br/> THE SPEED?
                </h2>
                <div className="flex flex-col sm:flex-row space-y-4 sm:space-y-0 sm:space-x-4">
                  <Link href="/signup" className="bg-white text-emerald-600 px-10 py-5 rounded-2xl font-black text-lg hover:bg-gray-100 transition-all flex items-center justify-center group">
                    Start Shopping
                    <ArrowRight className="ml-3 h-6 w-6 group-hover:translate-x-1 transition-transform" />
                  </Link>
                  <Link href="/login" className="bg-emerald-700 text-white px-10 py-5 rounded-2xl font-black text-lg hover:bg-emerald-800 transition-all text-center">
                    Sign In
                  </Link>
                </div>
              </div>
              <div className="mt-12 lg:mt-0 hidden lg:block">
                <div className="bg-white/10 backdrop-blur-md p-8 rounded-3xl border border-white/20">
                   <div className="flex items-center mb-6">
                      <div className="h-12 w-12 rounded-full bg-white/20 mr-4"></div>
                      <div className="h-4 w-32 bg-white/20 rounded"></div>
                   </div>
                   <div className="space-y-4">
                      <div className="h-10 bg-white/20 rounded-xl"></div>
                      <div className="h-10 bg-white/20 rounded-xl"></div>
                      <div className="h-20 bg-white/20 rounded-xl"></div>
                   </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-12 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row justify-between items-center text-sm text-gray-500 font-medium">
          <div className="flex items-center space-x-2 mb-4 md:mb-0">
            <span className="text-xl font-black text-emerald-600">AAGAM</span>
            <span>&copy; 2026. All rights reserved.</span>
          </div>
          <div className="flex space-x-8">
            <a href="#" className="hover:text-emerald-600 transition-colors">Privacy</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Terms</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Support</a>
            <a href="#" className="hover:text-emerald-600 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
