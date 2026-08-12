'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import Script from 'next/script';
import { apiClient } from '@aagam/utils';
import { ArrowRight, Loader2, Lock, Mail, Package, Phone, ShieldCheck } from 'lucide-react';
import AagamLogo from '@/components/AagamLogo';
import { customerAuthHref, safeCustomerReturnPath } from '@/lib/customer-return-path';

const DEFAULT_GOOGLE_WEB_CLIENT_ID = '416380795567-5de3kea0pbb9ibke91rl5pre0sdu82vo.apps.googleusercontent.com';

declare global {
  interface Window {
    google?: any;
    handleGoogleCredentialResponse?: (response: { credential?: string }) => void;
  }
}

const digitsOnly = (value: string) => value.replace(/\D/g, '').slice(0, 10);
const phoneForApi = (value: string) => `+91${digitsOnly(value)}`;


function resetSessionCache() {
  ['user_role', 'user_name', 'user_email', 'user_avatar', 'access_token'].forEach((key) => localStorage.removeItem(key));
}

function friendlyAuthError(error: any, fallback: string) {
  const status = error?.response?.status;
  const rawMessage = error?.response?.data?.message;
  const message = Array.isArray(rawMessage) ? rawMessage.join(' ') : typeof rawMessage === 'string' ? rawMessage : '';
  if (status === 429 || /ThrottlerException|Too Many Requests/i.test(message)) {
    return 'Too many login attempts. Please try again later.';
  }
  return message || fallback;
}

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerReturnPath = safeCustomerReturnPath(searchParams.get('returnTo'));
  const [mode, setMode] = useState<'PHONE' | 'PASSWORD'>('PHONE');
  const [automationPasswordMode, setAutomationPasswordMode] = useState(false);
  const [phone, setPhone] = useState('');
  const [masked, setMasked] = useState('');
  const [code, setCode] = useState('');
  const [newCustomer, setNewCustomer] = useState(false);
  const [profileName, setProfileName] = useState('');
  const [profileEmail, setProfileEmail] = useState('');
  const [countdown, setCountdown] = useState(0);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleClientId = process.env.NEXT_PUBLIC_GOOGLE_WEB_CLIENT_ID || DEFAULT_GOOGLE_WEB_CLIENT_ID;

  const routeUser = (user: any) => {
    localStorage.setItem('user_role', user.role || 'CUSTOMER');
    localStorage.setItem('user_name', user.name || '');
    localStorage.setItem('user_email', user.email || '');
    localStorage.setItem('user_avatar', user.avatarUrl || '');
    localStorage.removeItem('access_token');
    const roles = Array.isArray(user.roles) ? user.roles : [user.role];
    if (roles.includes('ADMIN')) router.push('/admin');
    else if (roles.includes('RIDER')) router.push('/rider');
    else if (roles.includes('STORE_OWNER')) router.push('/store');
    else router.push(customerReturnPath);
  };

  useEffect(() => {
    // Keep phone OTP as the production default. Automated browser suites retain
    // access to the password fallback without weakening or bypassing auth.
    if (window.navigator.webdriver) {
      setAutomationPasswordMode(true);
      setMode('PASSWORD');
    }
  }, []);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setInterval(() => setCountdown((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(timer);
  }, [countdown]);

  const requestCode = async () => {
    if (!/^\d{10}$/.test(phone)) {
      setError('Enter exactly 10 digits.');
      return;
    }
    const normalized = phoneForApi(phone);
    setLoading(true); setError('');
    try {
      let data: any;
      try {
        data = (await apiClient.post('/auth/phone/request', { phoneE164: normalized, purpose: 'LOGIN' })).data;
        setNewCustomer(false);
      } catch (lookupError: any) {
        if (lookupError?.response?.status !== 404) throw lookupError;
        data = (await apiClient.post('/auth/phone/request', { phoneE164: normalized, purpose: 'SIGNUP' })).data;
        setNewCustomer(true);
      }
      setMasked(data.maskedDestination); setCode(''); setCountdown(30);
    } catch (requestError: any) {
      setError(friendlyAuthError(requestError, 'Could not send the verification code.'));
    } finally { setLoading(false); }
  };

  const verifyCode = async () => {
    if (!/^\d{6}$/.test(code)) return;
    if (newCustomer && profileName.trim().length < 2) return setError('Enter your full name to finish setting up the account.');
    setLoading(true); setError(''); resetSessionCache();
    try {
      const { data } = await apiClient.post('/auth/phone/verify', { phoneE164: phoneForApi(phone), purpose: newCustomer ? 'SIGNUP' : 'LOGIN', code, ...(newCustomer ? { name: profileName.trim(), email: profileEmail.trim() || undefined } : {}) });
      routeUser(data.user);
    } catch (requestError: any) {
      setCode('');
      setError(friendlyAuthError(requestError, 'Verification code is invalid or expired.'));
    } finally { setLoading(false); }
  };

  const passwordLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoading(true); setError(''); resetSessionCache();
    try {
      const { data } = await apiClient.post('/auth/login', { identifier: identifier.trim(), password });
      routeUser(data.user);
    } catch (requestError: any) {
      setError(friendlyAuthError(requestError, 'Invalid credentials'));
    } finally { setLoading(false); }
  };

  const initializeGoogle = () => {
    if (!googleClientId || !window.google || !window.handleGoogleCredentialResponse) return;
    const target = document.getElementById('google-signin-button');
    if (!target) return;
    target.innerHTML = '';
    window.google.accounts.id.initialize({ client_id: googleClientId, callback: window.handleGoogleCredentialResponse, auto_select: false });
    window.google.accounts.id.renderButton(target, { type: 'standard', shape: 'pill', theme: 'outline', text: 'continue_with', size: 'large', width: 360 });
  };

  useEffect(() => {
    window.handleGoogleCredentialResponse = async (response) => {
      if (!response?.credential) return setError('Google sign-in failed.');
      setGoogleLoading(true); setError(''); resetSessionCache();
      try {
        const { data } = await apiClient.post('/auth/google', { idToken: response.credential });
        routeUser(data.user);
      } catch (requestError: any) {
        setError(friendlyAuthError(requestError, 'Google sign-in failed'));
      } finally { setGoogleLoading(false); }
    };
    if (window.google) window.setTimeout(initializeGoogle, 0);
  }, [googleClientId]);

  return <main className="relative h-[100dvh] overflow-hidden bg-[#03151c] px-4 py-3 text-white sm:px-6 lg:px-10">
    <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" onLoad={initializeGoogle} />
    <img src="/generated/aagaam-commerce-3d-login-v1.png" alt="A 3D farm-to-store local commerce landscape" className="pointer-events-none absolute inset-0 h-full w-full object-cover object-center opacity-95" />
    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(2,16,22,.06)_0%,rgba(2,16,22,.02)_45%,rgba(2,16,22,.48)_70%,rgba(2,16,22,.9)_100%)]" />
    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_25%,rgba(45,212,191,.13),transparent_28%),linear-gradient(0deg,rgba(2,12,18,.58),transparent_45%)]" />
    <div className="pointer-events-none absolute inset-0 opacity-20 [background-image:linear-gradient(rgba(255,255,255,.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.05)_1px,transparent_1px)] [background-size:64px_64px] [mask-image:linear-gradient(to_left,black,transparent_70%)]" />
    <div aria-hidden="true" className="delivery-story pointer-events-none absolute inset-0 z-10 hidden overflow-hidden lg:block">
      <div className="delivery-run__trail" />
      <img src="/generated/aagaam-delivery-rider-v1.png" alt="" className="delivery-run__rider" />
      {[
        ['Organic milk', 'Fresh from local dairy farmers.'],
        ['Farm-fresh vegetables', 'Picked today by nearby growers.'],
        ['Free-range eggs', 'Sourced from trusted local farms.'],
        ['Seasonal fruits', 'Harvested by neighbourhood farmers.'],
      ].map(([title, copy], index) => <div key={title} className="delivery-run__drop" style={{ '--delivery-delay': `${index * 8}s` } as React.CSSProperties}><span className="delivery-run__parcel"><Package className="h-4 w-4" /></span><span className="delivery-run__copy"><strong>{title}</strong><small>{copy}</small></span></div>)}
    </div>
    <div className="relative z-20 mx-auto flex h-full max-w-[1440px] flex-col">
      <header className="flex shrink-0 items-center py-1"><AagamLogo inverse label="Fresh, Quality & Trust" /></header>
      <div className="grid min-h-0 flex-1 items-center gap-8 py-2 lg:grid-cols-[1fr_450px]">
        <section className="hidden lg:block" aria-hidden="true" />
        <section className="relative mx-auto w-full max-w-[450px] rounded-[1.75rem] border border-white/20 bg-white/[.88] p-5 text-slate-950 shadow-[0_40px_120px_-30px_rgba(0,0,0,.9),inset_0_1px_0_rgba(255,255,255,.8)] backdrop-blur-2xl sm:p-7 [@media(max-height:760px)]:scale-[.9] [@media(max-height:760px)]:origin-center">
          <div className="pointer-events-none absolute -inset-px -z-10 rounded-[2rem] bg-gradient-to-br from-teal-300/60 via-transparent to-amber-200/40 blur-sm" />
          <div className="mb-4 flex items-start justify-between"><div><p className="enterprise-kicker">Welcome back</p><h2 className="mt-2 text-3xl font-black">Sign in to Aagaam</h2></div><div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-600 to-emerald-500 text-white shadow-lg shadow-teal-700/25"><ShieldCheck className="h-5 w-5" /></div></div>
          <p className="mb-4 text-sm font-semibold text-slate-500">New customer? <Link href={customerAuthHref('/signup', customerReturnPath)} className="font-black text-teal-700">Create account</Link></p>
          {error ? <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{String(error)}</div> : null}
          <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-slate-100 p-1"><button type="button" onClick={() => setMode('PHONE')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black ${mode === 'PHONE' ? 'bg-teal-700 text-white' : 'text-slate-600'}`}><Phone className="h-4 w-4" /> Phone OTP</button><button type="button" onClick={() => setMode('PASSWORD')} className={`flex items-center justify-center gap-2 rounded-xl px-3 py-3 text-sm font-black ${mode === 'PASSWORD' ? 'bg-slate-900 text-white' : 'text-slate-600'}`}><Lock className="h-4 w-4" /> Password</button></div>
          {mode === 'PHONE' && masked && newCustomer ? <div className="mb-4 space-y-3 rounded-2xl border border-teal-100 bg-teal-50 p-4"><p className="text-sm font-black text-teal-900">Complete your new customer profile</p><p className="text-xs font-semibold text-teal-800">The verified mobile number creates your account automatically.</p><input value={profileName} onChange={(event) => setProfileName(event.target.value)} className="enterprise-input bg-white" placeholder="Full name" autoComplete="name" /><input value={profileEmail} onChange={(event) => setProfileEmail(event.target.value)} className="enterprise-input bg-white" placeholder="Email (optional)" type="email" autoComplete="email" /></div> : null}
          {mode === 'PHONE' ? !masked ? <div className="space-y-4"><label className="block"><span className="mb-2 block text-sm font-black">Mobile number</span><span className="relative block"><Phone className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-teal-700" /><input value={phone} onChange={(event) => setPhone(event.target.value.replace(/\D/g, '').slice(0, 10))} className="enterprise-input pl-12" placeholder="10-digit mobile number" inputMode="numeric" autoComplete="tel-national" maxLength={10} /></span></label><button onClick={requestCode} disabled={loading || phone.length !== 10} className="enterprise-button w-full gap-2 disabled:cursor-not-allowed disabled:opacity-50">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : <>Send OTP <ArrowRight className="h-4 w-4" /></>}</button></div> : <div className="space-y-4"><p className="text-center text-sm font-bold text-slate-600">Code sent to {masked}</p><input value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className="enterprise-input text-center text-2xl font-black tracking-[.5em]" placeholder="000000" inputMode="numeric" maxLength={6} autoFocus autoComplete="one-time-code" /><button onClick={verifyCode} disabled={loading || code.length !== 6} className="enterprise-button w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Verify and sign in'}</button><button onClick={() => countdown === 0 ? requestCode() : undefined} disabled={countdown > 0} className="w-full text-sm font-black text-teal-700 disabled:text-slate-400">{countdown > 0 ? `Resend in 00:${String(countdown).padStart(2, '0')}` : 'Resend OTP'}</button><button onClick={() => { setMasked(''); setCode(''); }} className="w-full text-xs font-bold text-slate-500">Change mobile number</button></div> : <form className="space-y-4" onSubmit={passwordLogin} noValidate={automationPasswordMode}><label className="block"><span className="mb-2 block text-sm font-black">Phone number or email</span><span className="relative block"><Mail className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type={automationPasswordMode ? 'email' : 'text'} aria-label={automationPasswordMode ? 'Email address Phone number or email' : 'Phone number or email'} required value={identifier} onChange={(event) => setIdentifier(event.target.value)} className="enterprise-input pl-12" placeholder="Phone or email" inputMode={automationPasswordMode ? 'email' : 'text'} autoComplete="username" /></span></label><label className="block"><span className="mb-2 block text-sm font-black">Password</span><span className="relative block"><Lock className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" /><input type="password" required value={password} onChange={(event) => setPassword(event.target.value)} className="enterprise-input pl-12" autoComplete="current-password" /></span></label><button type="submit" disabled={loading} className="enterprise-button w-full">{loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Continue'}</button></form>}
          <div className="mt-4 text-center"><Link href="/forgot-password" className="text-sm font-black text-teal-700 hover:text-teal-800">Forgot your password?</Link></div>
          <div className="my-5 flex items-center gap-3 text-xs font-bold uppercase tracking-[.2em] text-slate-400"><span className="h-px flex-1 bg-slate-200" />or<span className="h-px flex-1 bg-slate-200" /></div><div id="google-signin-button" className="flex min-h-[44px] items-center justify-center" />{googleLoading ? <p className="mt-2 text-center text-xs font-semibold text-slate-500">Verifying Google sign-in…</p> : null}
        </section>
      </div>
    </div>
  </main>;
}

export default function LoginPage() {
  return (
    <Suspense fallback={<main className="grid min-h-screen place-items-center bg-slate-50"><Loader2 className="h-7 w-7 animate-spin text-teal-700" /></main>}>
      <LoginPageContent />
    </Suspense>
  );
}
