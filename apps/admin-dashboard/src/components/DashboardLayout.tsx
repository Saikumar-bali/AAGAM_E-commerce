'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Sidebar from './Sidebar';

import { apiClient } from '@aagam/utils';

interface DashboardLayoutProps {
  children: React.ReactNode;
  allowedRole: 'ADMIN' | 'RIDER' | 'CUSTOMER';
}

const DashboardLayout: React.FC<DashboardLayoutProps> = ({ children, allowedRole }) => {
  const [mounted, setMounted] = useState(false);
  const [userRole, setUserRole] = useState<string | null>(null);
  const router = useRouter();

  useEffect(() => {
    const verifySession = async () => {
      console.log(`[DashboardLayout] Verifying session for role: ${allowedRole}`);
      try {
        const response = await apiClient.get('/auth/me');
        const user = response.data;
        console.log('[DashboardLayout] Session verified. User:', user);
        
        if (user.role !== allowedRole) {
          console.warn(`[DashboardLayout] Role mismatch. Expected ${allowedRole}, got ${user.role}. Redirecting...`);
          // Simple RBAC check on client side
          if (user.role === 'ADMIN') router.push('/admin');
          else if (user.role === 'RIDER') router.push('/rider');
          else router.push('/shop');
          return;
        }

        setUserRole(user.role);
        setMounted(true);
      } catch (error: any) {
        console.error('[DashboardLayout] Session verification failed:', error.response?.data || error.message);
        router.push('/login');
      }
    };

    verifySession();
  }, [allowedRole, router]);

  if (!mounted) return null;

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      <Sidebar role={userRole as any} />
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-7xl mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
};

export default DashboardLayout;
