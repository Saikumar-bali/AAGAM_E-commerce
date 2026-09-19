'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { useToast } from '@/components/ToastProvider';
import {
  ArrowLeft,
  BadgeCheck,
  Calendar,
  Check,
  Headphones,
  Heart,
  Loader2,
  LogOut,
  Mail,
  MapPin,
  Package,
  Pencil,
  RotateCcw,
  ShieldCheck,
  Tag,
  X,
} from 'lucide-react';

type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  emailVerified: boolean;
  createdAt?: string;
};

export default function AccountPage() {
  const router = useRouter();
  const toast = useToast();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await apiClient.get('/auth/me');
        setProfile(res.data);
        setNameDraft(res.data.name || '');
        localStorage.setItem('user_name', res.data.name || '');
        localStorage.setItem('user_email', res.data.email || '');
        localStorage.setItem('user_avatar', res.data.avatarUrl || '');
      } catch {
        router.push('/login');
      } finally {
        setLoading(false);
      }
    };
    void fetchProfile();
  }, [router]);

  const handleSaveName = async () => {
    const name = nameDraft.trim();
    if (name.length < 2) {
      toast.warning('Enter at least two characters.', 'Name required');
      return;
    }
    setSaving(true);
    try {
      const res = await apiClient.patch('/auth/me', { name });
      setProfile((previous) => previous ? { ...previous, name: res.data.name } : previous);
      localStorage.setItem('user_name', res.data.name || '');
      setEditingName(false);
      toast.success('Your profile name was updated.', 'Profile saved');
    } catch {
      // Global API feedback displays the exact server message.
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } catch {
      // Local session cleanup must still complete.
    } finally {
      ['user_role', 'user_name', 'user_email', 'user_avatar', 'access_token'].forEach((key) => localStorage.removeItem(key));
      router.push('/login');
    }
  };

  const initials = (profile?.name || profile?.email || 'A')
    .split(' ')
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  const memberSince = profile?.createdAt
    ? new Date(profile.createdAt).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' })
    : null;
  const quickLinks = [
    { label: 'My Orders', icon: Package, href: '/shop/orders', color: 'bg-violet-100 text-violet-700', description: 'Track and manage orders' },
    { label: 'Addresses', icon: MapPin, href: '/shop/addresses', color: 'bg-teal-100 text-teal-700', description: 'Manage delivery locations' },
    { label: 'Wishlist', icon: Heart, href: '/shop/wishlist', color: 'bg-rose-100 text-rose-700', description: 'Saved products' },
    { label: 'Deals', icon: Tag, href: '/shop/deals', color: 'bg-amber-100 text-amber-700', description: 'Current offers' },
    { label: 'Reorder', icon: RotateCcw, href: '/shop/reorder', color: 'bg-sky-100 text-sky-700', description: 'Buy previous items again' },
    { label: 'Customer Support', icon: Headphones, href: '/shop/support', color: 'bg-emerald-100 text-emerald-700', description: 'Open and track order help' },
  ];

  if (loading) {
    return <DashboardLayout allowedRole="CUSTOMER"><div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div></DashboardLayout>;
  }
  if (!profile) return null;

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-4xl space-y-4 pb-8">
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-4 sm:px-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                <button onClick={() => router.push('/shop')} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:bg-slate-50">
                  <ArrowLeft className="h-4 w-4" />
                </button>
                {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Profile" className="h-14 w-14 shrink-0 rounded-lg border border-slate-200 object-cover sm:h-16 sm:w-16" /> : <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-950 text-lg font-semibold text-white sm:h-16 sm:w-16">{initials}</div>}
                <div className="min-w-0">
                  <p className="enterprise-kicker">Account</p>
                  <p className="mt-1 text-[11px] text-slate-500">Manage your identity, delivery details and shopping shortcuts.</p>
                </div>
              </div>
              <div className="flex items-center gap-2 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <ShieldCheck className="h-4 w-4 text-teal-600" />
                <div><p className="text-[11px] font-semibold text-slate-700">Secure profile</p><p className="text-[10px] text-slate-500">Protected account session</p></div>
              </div>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0 flex-1">
                <p className="enterprise-kicker">Personal profile</p>
                {editingName ? <div className="mt-2 flex max-w-xl items-center gap-2"><input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void handleSaveName()} className="enterprise-input" placeholder="Your name" /><button onClick={() => void handleSaveName()} disabled={saving || nameDraft.trim().length < 2} aria-label="Save name" className="grid h-9 w-9 place-items-center rounded-md bg-teal-700 text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button><button onClick={() => { setEditingName(false); setNameDraft(profile.name || ''); }} aria-label="Cancel editing" className="grid h-9 w-9 place-items-center rounded-md bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button></div> : <div className="mt-1.5 flex items-center gap-2"><h1 className="truncate text-lg font-semibold text-slate-950 sm:text-xl">{profile.name || 'Aagaam customer'}</h1><button onClick={() => setEditingName(true)} aria-label="Edit name" className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button></div>}
                <p className="mt-1 text-[11px] text-slate-500">Your profile information is used for receipts, support and delivery communication.</p>
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-3">
              <div className="flex min-w-0 items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-slate-400"><Mail className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Email</p><p className="truncate text-[11px] font-medium text-slate-900">{profile.email}</p></div></div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-emerald-50 text-emerald-700"><BadgeCheck className="h-4 w-4" /></span><div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Account status</p><p className="text-[11px] font-medium text-slate-900">{profile.emailVerified ? 'Verified' : 'Active'}</p></div></div>
              <div className="flex items-center gap-2.5 rounded-lg border border-slate-100 bg-slate-50 p-3"><span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-slate-400"><Calendar className="h-4 w-4" /></span><div><p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">Member since</p><p className="text-[11px] font-medium text-slate-900">{memberSince || 'Active member'}</p></div></div>
            </div>
          </div>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 sm:p-5">
          <div className="flex items-end justify-between gap-3"><div><p className="enterprise-kicker">Your workspace</p><h2 className="mt-2 text-lg font-semibold text-slate-950">Shopping and account shortcuts</h2></div></div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{quickLinks.map((link) => <button key={link.label} onClick={() => router.push(link.href)} className="group flex min-h-[60px] items-center gap-2.5 rounded-lg border border-slate-100 p-3 text-left transition hover:border-teal-200"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-md ${link.color}`}><link.icon className="h-4 w-4" /></span><span className="min-w-0"><span className="block text-sm font-medium text-slate-900">{link.label}</span><span className="mt-0.5 block text-[11px] text-slate-500">{link.description}</span></span></button>)}</div>
        </section>

        <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-semibold text-slate-950">Finished shopping?</p><p className="mt-1 text-sm font-semibold text-slate-500">Sign out of this browser while keeping your account and order history safe.</p></div>
          <button onClick={() => void handleLogout()} className="flex shrink-0 items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-5 py-3.5 text-sm font-bold text-red-700 transition hover:bg-red-100"><LogOut className="h-4 w-4" />Sign out</button>
        </div>
      </div>
    </DashboardLayout>
  );
}
