'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { ArrowRight, Loader2, Lock, Mail, User } from 'lucide-react';

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSignup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/signup', { name, email, password, role: 'CUSTOMER' });
      const result = await apiClient.post('/auth/login', { email, password });
      const { user, access_token } = result.data;
      localStorage.setItem('user_role', user.role);
      localStorage.setItem('user_name', user.name || '');
      localStorage.setItem('user_email', user.email || '');
      localStorage.setItem('user_avatar', user.avatarUrl || '');
      localStorage.setItem('access_token', access_token);
      router.push('/shop');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative min-h-screen overflow-hidden px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" />
      <div className="relative mx-auto max-w-md">
        <Link href="/" className="mb-6 flex justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">A</span></Link>
        <p className="enterprise-kicker mx-auto mb-4 w-fit">Customer account</p>
        <h1 className="text-center text-4xl font-black tracking-[-0.06em]">Create your shopping account</h1>
        <p className="mt-2 text-center text-sm font-semibold text-slate-500">Already have an account? <Link href="/login" className="font-black text-teal-700">Sign in</Link></p>
        <section className="enterprise-panel mt-8 p-6 sm:p-8">
          <div className="mb-5 rounded-2xl border border-teal-100 bg-teal-50/80 p-4 text-sm font-semibold text-teal-900">Public signup creates customer accounts only. Use Continue with Google on the login page for instant customer signup with Google profile details.</div>
          {error ? <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{error}</div> : null}
          <form className="space-y-5" onSubmit={handleSignup}>
            <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Full name</span><span className="relative block"><User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required value={name} onChange={(event) => setName(event.target.value)} className="enterprise-input pl-12" placeholder="Your name" /></span></label>
            <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Email address</span><span className="relative block"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="enterprise-input pl-12" placeholder="you@example.com" /></span></label>
            <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required type="password" value={password} onChange={(event) => setPassword(event.target.value)} className="enterprise-input pl-12" placeholder="At least 8 characters" /></span></label>
            <button disabled={loading} className="enterprise-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Create customer account <ArrowRight className="h-4 w-4" /></>}</button>
          </form>
        </section>
      </div>
    </main>
  );
}
