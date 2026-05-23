'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { 
  LayoutDashboard, 
  Store, 
  Package, 
  Truck, 
  ShoppingCart, 
  LogOut,
  User,
  MapPin,
  Heart,
  Tag,
  RotateCcw,
  UserCircle,
} from 'lucide-react';

import { apiClient } from '@aagam/utils';
import AagamLogo from './AagamLogo';

interface SidebarProps {
  role: 'ADMIN' | 'RIDER' | 'CUSTOMER';
}

const Sidebar: React.FC<SidebarProps> = ({ role }) => {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch (error) {
      console.error('Logout failed', error);
    } finally {
      localStorage.removeItem('user_role');
      localStorage.removeItem('user_name');
      router.push('/login');
    }
  };

  const menuItems = {
    ADMIN: [
      { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { name: 'Stores', href: '/admin/stores', icon: Store },
      { name: 'Products', href: '/admin/products', icon: Package },
      { name: 'Riders', href: '/admin/riders', icon: Truck },
      { name: 'Orders', href: '/admin/orders', icon: ShoppingCart },
    ],
    RIDER: [
      { name: 'Queue', href: '/rider', icon: Truck },
      { name: 'History', href: '/rider/history', icon: ShoppingCart },
      { name: 'Profile', href: '/rider/profile', icon: User },
    ],
    CUSTOMER: [
      { name: 'Shop', href: '/shop', icon: ShoppingCart },
      { name: 'My Orders', href: '/shop/orders', icon: Package },
      { name: 'Addresses', href: '/shop/addresses', icon: MapPin },
      { name: 'Wishlist', href: '/shop/wishlist', icon: Heart },
      { name: 'Deals', href: '/shop/deals', icon: Tag },
      { name: 'Reorder', href: '/shop/reorder', icon: RotateCcw },
      { name: 'Account', href: '/shop/account', icon: UserCircle },
    ],
  };

  const currentMenu = menuItems[role] || [];

  return (
    <>
    <aside className="relative z-10 hidden h-screen w-72 flex-col border-r border-white/10 bg-slate-950 text-white shadow-[28px_0_80px_rgba(15,23,42,0.22)] lg:flex">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(20,184,166,0.22),transparent_20rem),radial-gradient(circle_at_bottom_right,rgba(245,158,11,0.16),transparent_18rem)]" />
      <div className="relative p-6">
        <AagamLogo inverse label={`${role} portal`} />
        <div className="mt-7 rounded-[1.5rem] border border-white/10 bg-white/8 p-4 backdrop-blur-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-400">Today signal</p>
          <div className="mt-3 flex items-end justify-between">
            <div>
              <p className="text-2xl font-black">98.4%</p>
              <p className="text-xs font-semibold text-slate-400">Fulfillment health</p>
            </div>
            <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-black text-emerald-200">ONLINE</span>
          </div>
        </div>
      </div>

      <nav className="relative flex-1 px-4 space-y-2">
        {currentMenu.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`group flex items-center rounded-2xl px-4 py-3 text-sm font-extrabold transition-all ${
                isActive 
                  ? 'bg-white text-slate-950 shadow-2xl shadow-teal-950/20' 
                  : 'text-slate-400 hover:bg-white/10 hover:text-white'
              }`}
            >
              <span className={`mr-3 flex h-10 w-10 items-center justify-center rounded-xl transition ${isActive ? 'bg-teal-50 text-teal-700' : 'bg-white/5 text-slate-400 group-hover:text-teal-200'}`}>
                <Icon className="h-5 w-5" />
              </span>
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="relative p-4">
        <button
          onClick={handleLogout}
          className="flex w-full items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-extrabold text-slate-300 transition hover:border-red-300/30 hover:bg-red-500/10 hover:text-red-200"
        >
          <LogOut className="mr-3 h-5 w-5" />
          Logout
        </button>
      </div>
    </aside>
    <nav className="fixed inset-x-3 bottom-3 z-40 flex items-center justify-around rounded-[1.5rem] border border-white/70 bg-slate-950/92 p-2 text-white shadow-[0_24px_70px_rgba(15,23,42,0.32)] backdrop-blur-2xl lg:hidden">
      {currentMenu.slice(0, 4).map((item) => {
        const Icon = item.icon;
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.name}
            href={item.href}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-2xl px-2 py-2 text-[10px] font-black transition ${
              isActive ? 'bg-white text-slate-950' : 'text-slate-400 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Icon className="h-5 w-5" />
            <span className="max-w-full truncate">{item.name}</span>
          </Link>
        );
      })}
    </nav>
    </>
  );
};

export default Sidebar;
