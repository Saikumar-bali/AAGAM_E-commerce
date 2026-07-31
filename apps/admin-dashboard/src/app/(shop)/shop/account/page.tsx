'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import DashboardLayout from '@/components/DashboardLayout';
import { apiClient } from '@aagam/utils';
import { useToast } from '@/components/ToastProvider';
import {
  Mail, Calendar, BadgeCheck, MapPin, Package, Heart, Tag,
  LogOut, Loader2, Pencil, Check, X, RotateCcw,
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
      // Session cleanup must still complete locally.
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
    { label: 'My Orders', icon: Package, href: '/shop/orders', color: 'bg-violet-100 text-violet-700' },
    { label: 'Addresses', icon: MapPin, href: '/shop/addresses', color: 'bg-teal-100 text-teal-700' },
    { label: 'Wishlist', icon: Heart, href: '/shop/wishlist', color: 'bg-rose-100 text-rose-700' },
    { label: 'Deals', icon: Tag, href: '/shop/deals', color: 'bg-amber-100 text-amber-700' },
    { label: 'Reorder', icon: RotateCcw, href: '/shop/reorder', color: 'bg-sky-100 text-sky-700' },
  ];

  if (loading) {
    return <DashboardLayout allowedRole="CUSTOMER"><div className="flex h-64 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-teal-600" /></div></DashboardLayout>;
  }
  if (!profile) return null;

  return (
    <DashboardLayout allowedRole="CUSTOMER">
      <div className="mx-auto max-w-2xl space-y-5 pb-4">
        <section className="overflow-hidden rounded-3xl border border-white/80 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.1)]">
          <div className="relative h-28 bg-gradient-to-r from-teal-700 via-teal-600 to-cyan-500"><div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-white/15" /><div className="absolute bottom-3 right-5 text-xs font-black uppercase tracking-[0.2em] text-white/75">Aagaam account</div></div>
          <div className="-mt-12 px-5 pb-6 sm:px-7">
            <div className="flex items-end gap-4">
              {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Profile" className="h-20 w-20 rounded-2xl border-4 border-white object-cover shadow-lg" /> : <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl border-4 border-white bg-slate-950 text-2xl font-black text-white shadow-lg">{initials}</div>}
              <div className="min-w-0 flex-1 pb-1"><p className="text-xs font-black uppercase tracking-wider text-teal-700">Personal profile</p><p className="mt-1 text-sm font-semibold text-slate-500">Manage your details and shopping shortcuts.</p></div>
            </div>
            <div className="mt-5">
              {editingName ? <div className="flex items-center gap-2"><input autoFocus value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} onKeyDown={(event) => event.key === 'Enter' && void handleSaveName()} className="min-w-0 flex-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-bold outline-none focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20" placeholder="Your name" /><button onClick={() => void handleSaveName()} disabled={saving || nameDraft.trim().length < 2} aria-label="Save name" className="grid h-10 w-10 place-items-center rounded-xl bg-teal-600 text-white disabled:opacity-50">{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}</button><button onClick={() => { setEditingName(false); setNameDraft(profile.name || ''); }} aria-label="Cancel editing" className="grid h-10 w-10 place-items-center rounded-xl bg-slate-100 text-slate-500"><X className="h-4 w-4" /></button></div> : <div className="flex items-center gap-2"><h1 className="text-2xl font-black text-slate-950">{profile.name || 'Aagaam customer'}</h1><button onClick={() => setEditingName(true)} aria-label="Edit name" className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-100 hover:text-slate-700"><Pencil className="h-3.5 w-3.5" /></button></div>}
            </div>
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm"><Mail className="h-4 w-4" /></span><div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Email</p><p className="truncate font-semibold text-slate-900">{profile.email}</p></div></div>
              <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5"><span className="grid h-10 w-10 place-items-center rounded-xl bg-emerald-50 text-emerald-700"><BadgeCheck className="h-4 w-4" /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Account status</p><p className="font-semibold text-slate-900">{profile.emailVerified ? 'Verified' : 'Active'}</p></div></div>
              {memberSince ? <div className="flex items-center gap-3 rounded-2xl bg-slate-50 p-3.5 sm:col-span-2"><span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-slate-500 shadow-sm"><Calendar className="h-4 w-4" /></span><div><p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Member since</p><p className="font-semibold text-slate-900">{memberSince}</p></div></div> : null}
            </div>
          </div>
        </section>

        <section className="rounded-3xl border border-white/80 bg-white p-5 shadow-sm">
          <p className="mb-4 text-xs font-black uppercase tracking-wider text-slate-400">Quick links</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{quickLinks.map((link) => <button key={link.label} onClick={() => router.push(link.href)} className="flex min-h-16 items-center gap-3 rounded-2xl border border-slate-100 p-3 text-left transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-sm"><span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${link.color}`}><link.icon className="h-4 w-4" /></span><span className="text-sm font-bold text-slate-900">{link.label}</span></button>)}</div>
        </section>

        <button onClick={() => void handleLogout()} className="flex w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-bold text-red-700 transition hover:bg-red-100"><LogOut className="h-4 w-4" />Sign out</button>
      </div>
    </DashboardLayout>
  );
}
