'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { apiClient } from '@aagam/utils';
import { ArrowRight, Loader2, Mail, Phone, ShieldCheck, User } from 'lucide-react';
import { customerAuthHref, safeCustomerReturnPath } from '@/lib/customer-return-path';

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const phoneForApi = (value: string) => `+91${digitsOnly(value)}`;

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = safeCustomerReturnPath(searchParams.get('returnTo'));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const requestCode = async () => {
    if (name.trim().length < 2) return setError('Enter your full name.');
    if (!/^\d{10}$/.test(phone)) return setError('Enter exactly 10 digits.');
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return setError('Enter a valid email address or leave it blank.');
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.post('/auth/phone/request', {
        phoneE164: phoneForApi(phone),
        purpose: 'SIGNUP',
      });
      setMasked(data.maskedDestination);
      setCode('');
      setCountdown(30);
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Verification code could not be sent.');
    } finally {
      setLoading(false);
    }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.post('/auth/phone/verify', {
        phoneE164: phoneForApi(phone),
        purpose: 'SIGNUP',
        code,
        name: name.trim(),
        email: email.trim() || undefined,
      });
      const user = data.user;
      localStorage.setItem('user_role', user.role || 'CUSTOMER');
      localStorage.setItem('user_name', user.name || '');
      localStorage.setItem('user_email', user.email || '');
      localStorage.setItem('user_avatar', user.avatarUrl || '');
      localStorage.removeItem('access_token');
      router.push(returnTo);
    } catch (requestError: any) {
      setCode('');
      setError(requestError?.response?.data?.message || 'Verification code is invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  return <main className="relative min-h-screen overflow-hidden px-4 py-12 text-slate-950 sm:px-6 lg:px-8">
    <div className="pointer-events-none absolute inset-0 enterprise-subtle-grid opacity-60" />
    <div className="relative mx-auto max-w-md">
      <Link href="/" className="mb-6 flex justify-center"><span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-950 text-xl font-black text-white">A</span></Link>
      <p className="enterprise-kicker mx-auto mb-4 w-fit">Phone-first customer account</p>
      <h1 className="text-center text-4xl font-black tracking-[-.06em]">Create your shopping account</h1>
      <p className="mt-2 text-center text-sm font-semibold text-slate-500">Already registered? <Link href={customerAuthHref('/login', returnTo)} className="font-black text-teal-700">Sign in</Link></p>
      <section className="enterprise-panel mt-8 p-6 sm:p-8">
        <div className="mb-5 flex gap-3 rounded-2xl border border-teal-100 bg-teal-50 p-4 text-sm font-semibold text-teal-900"><ShieldCheck className="mt-0.5 h-5 w-5 shrink-0" /><span>Your verified mobile number is the primary login. Email is optional and no password is required.</span></div>
        {error ? <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{String(error)}</div> : null}
        {!masked ? <div className="space-y-5">
          <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Full name</span><span className="relative block"><User className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input required value={name} onChange={(event) => setName(event.target.value)} className="enterprise-input pl-12" placeholder="Your full name" autoComplete="name" /></span></label>
          <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Mobile number</span><span className="relative block"><Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-700" /><input required value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} className="enterprise-input pl-12" placeholder="10-digit mobile number" inputMode="numeric" autoComplete="tel-national" maxLength={10} /></span></label>
          <label className="block"><span className="mb-2 block text-sm font-black text-slate-700">Email address <span className="font-semibold text-slate-400">(optional)</span></span><span className="relative block"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="enterprise-input pl-12" placeholder="you@example.com" autoComplete="email" /></span></label>
          <button onClick={requestCode} disabled={loading || phone.length !== 10} className="enterprise-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-60">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4" /></>}</button>
        </div> : <div className="space-y-5"><p className="text-center text-sm font-bold text-slate-600">Enter the six-digit code sent to {masked}</p><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="enterprise-input text-center text-2xl font-black tracking-[.5em]" inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" placeholder="000000" /><button onClick={verifyCode} disabled={loading || code.length !== 6} className="enterprise-button w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verify and create account'}</button><button onClick={() => countdown === 0 ? requestCode() : undefined} disabled={countdown > 0} className="w-full text-sm font-black text-teal-700 disabled:text-slate-400">{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend OTP'}</button><button onClick={() => { setMasked(''); setCode(''); }} className="w-full text-xs font-bold text-slate-500">Edit account details</button></div>}
      </section>
    </div>
  </main>;
}

export default function SignupPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></main>}>
      <SignupPageContent />
    </Suspense>
  );
}
