'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { Lock, Mail, User, Loader2, ArrowRight, Check, X, Eye, EyeOff } from 'lucide-react';

interface PasswordRequirement { label: string; test: (password: string) => boolean; }

const passwordRequirements: PasswordRequirement[] = [
  { label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { label: 'At least one uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { label: 'At least one lowercase letter', test: (p) => /[a-z]/.test(p) },
  { label: 'At least one number', test: (p) => /\d/.test(p) },
];

function getPasswordStrength(password: string): { score: number; label: string; color: string } {
  const passed = passwordRequirements.filter((req) => req.test(password)).length;
  if (passed === 0) return { score: 0, label: 'Very Weak', color: 'bg-gray-200' };
  if (passed === 1) return { score: 20, label: 'Weak', color: 'bg-red-500' };
  if (passed === 2) return { score: 40, label: 'Fair', color: 'bg-orange-500' };
  if (passed === 3) return { score: 60, label: 'Good', color: 'bg-yellow-400' };
  return { score: 100, label: 'Strong', color: 'bg-emerald-500' };
}

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const strength = getPasswordStrength(password);
  const metRequirements = passwordRequirements.filter((req) => req.test(password));

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (metRequirements.length < 4) { setError('Please meet all password requirements'); return; }
    setLoading(true);
    setError('');
    try {
      await apiClient.post('/auth/signup', { email, password, name, role: 'CUSTOMER' });
      router.push('/login');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Signup failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden px-4 py-12 sm:px-6 lg:px-8">
      <div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" />
      <div className="pointer-events-none absolute -left-24 top-12 h-96 w-96 rounded-full bg-teal-300/25 blur-3xl" />
      <div className="pointer-events-none absolute -right-16 bottom-0 h-[28rem] w-[28rem] rounded-full bg-amber-200/40 blur-3xl" />
      <div className="relative sm:mx-auto sm:w-full sm:max-w-md">
        <Link href="/" className="mb-6 flex justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white shadow-2xl shadow-slate-950/20">A</span></Link>
        <p className="enterprise-kicker mx-auto mb-4 w-fit">Customer account</p>
        <h2 className="text-center text-4xl font-black tracking-[-0.06em] text-slate-950">Create your shopping account</h2>
        <p className="mt-2 text-center text-sm font-semibold text-slate-500">Already have an account? <Link href="/login" className="font-black text-teal-700 transition-colors hover:text-teal-900">Sign in</Link></p>
      </div>

      <div className="relative mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="enterprise-panel px-4 py-8 sm:px-10">
          <form className="space-y-6" onSubmit={handleSignup}>
            {error && <div className="rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-medium text-red-600">{error}</div>}
            <div><label className="mb-2 block text-sm font-bold text-gray-700">Full Name</label><div className="relative"><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4"><User className="h-5 w-5 text-gray-400" /></div><input type="text" required value={name} onChange={(e) => setName(e.target.value)} className="enterprise-input pl-11" placeholder="Your name" /></div></div>
            <div><label className="mb-2 block text-sm font-bold text-gray-700">Email address</label><div className="relative"><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4"><Mail className="h-5 w-5 text-gray-400" /></div><input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="enterprise-input pl-11" placeholder="you@example.com" /></div></div>
            <div><label className="mb-2 block text-sm font-bold text-gray-700">Password</label><div className="relative"><div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-4"><Lock className="h-5 w-5 text-gray-400" /></div><input type={showPassword ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)} className="enterprise-input pl-11 pr-12" placeholder="••••••••" /><button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute inset-y-0 right-0 flex items-center pr-4">{showPassword ? <EyeOff className="h-5 w-5 text-gray-400 hover:text-gray-600" /> : <Eye className="h-5 w-5 text-gray-400 hover:text-gray-600" />}</button></div>{password && <div className="mt-3"><div className="mb-1 flex items-center justify-between"><span className="text-xs font-medium text-gray-500">Password Strength</span><span className={`text-xs font-bold ${strength.label === 'Strong' ? 'text-emerald-600' : strength.label === 'Good' ? 'text-yellow-500' : strength.label === 'Fair' ? 'text-orange-500' : 'text-red-500'}`}>{strength.label}</span></div><div className="h-2 w-full overflow-hidden rounded-full bg-gray-100"><div className={`h-full ${strength.color} transition-all duration-300`} style={{ width: `${strength.score}%` }} /></div></div>}</div>
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Password Requirements</p><div className="grid grid-cols-2 gap-2">{passwordRequirements.map((req, idx) => <div key={idx} className={`flex items-center text-xs ${req.test(password) ? 'text-emerald-600' : 'text-gray-400'}`}>{req.test(password) ? <Check className="mr-1 h-3 w-3 flex-shrink-0" /> : <X className="mr-1 h-3 w-3 flex-shrink-0" />}<span className={req.test(password) ? 'font-medium' : ''}>{req.label}</span></div>)}</div></div>
            <div className="rounded-2xl border border-teal-100 bg-teal-50/80 p-4 text-sm font-semibold text-teal-900">Public signup creates customer accounts only. Operational access is handled separately.</div>
            <button type="submit" disabled={loading || metRequirements.length < 4} className="enterprise-button group w-full gap-2 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>CREATE CUSTOMER ACCOUNT<ArrowRight className="ml-2 h-5 w-5 transition-transform group-hover:translate-x-1" /></>}</button>
          </form>
        </div>
      </div>
    </div>
  );
}
