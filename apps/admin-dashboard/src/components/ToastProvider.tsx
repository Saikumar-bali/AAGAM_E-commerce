'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Info, X, XCircle } from 'lucide-react';
import { apiClient } from '@aagam/utils';

type ToastKind = 'success' | 'error' | 'warning' | 'info';
type ToastInput = { title?: string; message: string; kind?: ToastKind; duration?: number };
type ToastItem = Required<Pick<ToastInput, 'message' | 'kind'>> & Pick<ToastInput, 'title'> & { id: number; duration: number };
type ToastApi = {
  show: (input: ToastInput | string) => void;
  success: (message: string, title?: string, duration?: number) => void;
  error: (message: string, title?: string, duration?: number) => void;
  warning: (message: string, title?: string, duration?: number) => void;
  info: (message: string, title?: string, duration?: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

function extractMessage(value: any, fallback = 'Something went wrong. Please try again.') {
  const raw = value?.response?.data?.message ?? value?.message ?? value;
  if (Array.isArray(raw)) return raw.filter(Boolean).join(', ');
  if (raw && typeof raw === 'object') return String(raw.message || raw.error || JSON.stringify(raw));
  return typeof raw === 'string' && raw.trim() ? raw.trim() : fallback;
}

function errorTitle(status?: number) {
  if (status === 409) return 'Action could not be completed';
  if (status === 401) return 'Session expired';
  if (status === 403) return 'Access denied';
  if (status === 404) return 'Not found';
  if (status === 422 || status === 400) return 'Check the entered details';
  if (status === 429) return 'Too many requests';
  return 'Request failed';
}

function requestPayload(config: any) {
  const data = config?.data;
  if (!data || typeof data !== 'string') return data;
  try {
    return JSON.parse(data);
  } catch {
    return data;
  }
}

function shouldSkipGlobalErrorToast(error: any) {
  const config = error?.config;
  if (config?.skipGlobalToast === true) return true;

  const status = error?.response?.status;
  const requestPath = String(config?.url || '').split('?')[0];
  const payload = requestPayload(config);

  // A missing LOGIN identity is an expected branch in the customer OTP flow:
  // the caller immediately retries the same number with purpose SIGNUP.
  return status === 404
    && requestPath.endsWith('/auth/phone/request')
    && payload?.purpose === 'LOGIN';
}

const visual = {
  success: { icon: CheckCircle2, shell: 'border-emerald-200 bg-white', iconBox: 'bg-emerald-50 text-emerald-700', title: 'text-emerald-950' },
  error: { icon: XCircle, shell: 'border-red-200 bg-white', iconBox: 'bg-red-50 text-red-700', title: 'text-red-950' },
  warning: { icon: AlertCircle, shell: 'border-amber-200 bg-white', iconBox: 'bg-amber-50 text-amber-700', title: 'text-amber-950' },
  info: { icon: Info, shell: 'border-sky-200 bg-white', iconBox: 'bg-sky-50 text-sky-700', title: 'text-sky-950' },
} satisfies Record<ToastKind, any>;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const lastToast = useRef({ key: '', at: 0 });

  const remove = useCallback((id: number) => setItems((current) => current.filter((item) => item.id !== id)), []);
  const show = useCallback((input: ToastInput | string) => {
    const normalized: ToastInput = typeof input === 'string' ? { message: input } : input;
    const message = normalized.message?.trim();
    if (!message) return;
    const kind = normalized.kind || 'info';
    const dedupeKey = `${kind}:${normalized.title || ''}:${message}`;
    const now = Date.now();
    if (lastToast.current.key === dedupeKey && now - lastToast.current.at < 1200) return;
    lastToast.current = { key: dedupeKey, at: now };
    const item: ToastItem = { id: nextId.current++, kind, title: normalized.title, message, duration: normalized.duration ?? (kind === 'error' ? 6500 : 4200) };
    setItems((current) => [...current.slice(-3), item]);
    window.setTimeout(() => remove(item.id), item.duration);
  }, [remove]);

  const api = useMemo<ToastApi>(() => ({
    show,
    success: (message, title = 'Done', duration?: number) => show({ kind: 'success', title, message, ...(duration !== undefined ? { duration } : {}) }),
    error: (message, title = 'Request failed', duration?: number) => show({ kind: 'error', title, message, ...(duration !== undefined ? { duration } : {}) }),
    warning: (message, title = 'Attention required', duration?: number) => show({ kind: 'warning', title, message, ...(duration !== undefined ? { duration } : {}) }),
    info: (message, title = 'Information', duration?: number) => show({ kind: 'info', title, message, ...(duration !== undefined ? { duration } : {}) }),
  }), [show]);

  useEffect(() => {
    const responseInterceptor = apiClient.interceptors.response.use(
      (response) => {
        const method = String(response.config?.method || '').toLowerCase();
        const responseMessage = response.data?.message;
        if (['post', 'put', 'patch', 'delete'].includes(method) && typeof responseMessage === 'string' && responseMessage.trim()) {
          const isLoginSuccess = String(response.config?.url || '').includes('/auth/') || /login successful|signed in successfully/i.test(responseMessage);
          if (isLoginSuccess) return response;
          show({ kind: 'success', title: 'Done', message: responseMessage.trim() });
        }
        return response;
      },
      (error) => {
        if (!shouldSkipGlobalErrorToast(error)) {
          const status = error?.response?.status;
          show({ kind: status === 422 || status === 400 ? 'warning' : 'error', title: errorTitle(status), message: extractMessage(error) });
        }
        return Promise.reject(error);
      },
    );
    const eventHandler = (event: Event) => show((event as CustomEvent<ToastInput>).detail);
    window.addEventListener('aagam:toast', eventHandler);
    return () => {
      apiClient.interceptors.response.eject(responseInterceptor);
      window.removeEventListener('aagam:toast', eventHandler);
    };
  }, [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-3 top-3 z-[200] flex flex-col items-center gap-2 sm:inset-x-auto sm:right-5 sm:top-5 sm:w-[390px] sm:items-stretch" aria-live="polite" aria-atomic="false">
        {items.map((item) => {
          const style = visual[item.kind];
          const Icon = style.icon;
          return (
            <div key={item.id} role={item.kind === 'error' ? 'alert' : 'status'} className={`pointer-events-auto w-full overflow-hidden rounded-2xl border p-3.5 shadow-[0_18px_55px_rgba(15,23,42,0.18)] backdrop-blur-xl ${style.shell}`}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${style.iconBox}`}><Icon className="h-5 w-5" /></span>
                <div className="min-w-0 flex-1">
                  {item.title ? <p className={`text-sm font-black ${style.title}`}>{item.title}</p> : null}
                  <p className="mt-0.5 break-words text-sm font-semibold leading-5 text-slate-600">{item.message}</p>
                </div>
                <button type="button" onClick={() => remove(item.id)} aria-label="Dismiss notification" className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
              </div>
              <div className="mt-3 h-1 overflow-hidden rounded-full bg-slate-100"><div className="h-full origin-left bg-current opacity-25" style={{ animation: `aagam-toast-progress ${item.duration}ms linear forwards` }} /></div>
            </div>
          );
        })}
      </div>
      <style jsx global>{`@keyframes aagam-toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);
  if (!value) throw new Error('useToast must be used inside ToastProvider');
  return value;
}

export { extractMessage as getToastErrorMessage, shouldSkipGlobalErrorToast };
