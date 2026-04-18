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
  Settings, 
  LogOut,
  User
} from 'lucide-react';

import { apiClient } from '@aagam/utils';

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
      localStorage.clear();
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
    ],
  };

  const currentMenu = menuItems[role] || [];

  return (
    <div className="flex flex-col h-screen w-64 bg-gray-900 text-white border-r border-gray-800">
      <div className="p-6">
        <h1 className="text-2xl font-bold text-emerald-500">Aagam</h1>
        <p className="text-xs text-gray-400 mt-1 uppercase tracking-widest">{role} PORTAL</p>
      </div>

      <nav className="flex-1 px-4 space-y-1">
        {currentMenu.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center px-4 py-3 text-sm font-medium rounded-lg transition-colors ${
                isActive 
                  ? 'bg-emerald-600 text-white' 
                  : 'text-gray-400 hover:bg-gray-800 hover:text-white'
              }`}
            >
              <Icon className="mr-3 h-5 w-5" />
              {item.name}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-800">
        <button
          onClick={handleLogout}
          className="flex items-center w-full px-4 py-3 text-sm font-medium text-gray-400 rounded-lg hover:bg-red-900/20 hover:text-red-400 transition-colors"
        >
          <LogOut className="mr-3 h-5 w-5" />
          Logout
        </button>
      </div>
    </div>
  );
};

export default Sidebar;
