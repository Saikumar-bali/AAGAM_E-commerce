'use client';

import { useEffect } from 'react';

function isLoginPhoneInput(target: EventTarget | null): target is HTMLInputElement {
  if (!(target instanceof HTMLInputElement) || window.location.pathname !== '/login') return false;
  const hint = `${target.placeholder} ${target.getAttribute('aria-label') || ''}`.toLowerCase();
  const isPhoneField = target.dataset.aagamPhoneGuard === 'true'
    || target.inputMode === 'tel'
    || target.inputMode === 'numeric'
    || target.autocomplete === 'tel'
    || target.autocomplete === 'tel-national';
  return isPhoneField && (hint.includes('mobile') || hint.includes('phone'));
}

function normalizePhoneInput(value: string) {
  const digits = value.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2);
  return digits;
}

function configure(input: HTMLInputElement) {
  input.dataset.aagamPhoneGuard = 'true';
  // Keep enough room for +91 plus ten national digits so browser autofill reaches
  // the normalizer before React receives the controlled value.
  input.maxLength = 13;
  input.inputMode = 'numeric';
  input.pattern = '[0-9]{10}';
  input.autocomplete = 'tel-national';
}

export default function TenDigitPhoneGuard() {
  useEffect(() => {
    const configureVisibleInputs = () => {
      if (window.location.pathname !== '/login') return;
      document.querySelectorAll<HTMLInputElement>('input[inputmode="tel"], input[inputmode="numeric"], input[autocomplete="tel"], input[autocomplete="tel-national"], input[data-aagam-phone-guard="true"]').forEach((input) => {
        const hint = `${input.placeholder} ${input.getAttribute('aria-label') || ''}`.toLowerCase();
        if (hint.includes('mobile') || hint.includes('phone')) configure(input);
      });
    };
    const sanitize = (event: Event) => {
      if (!isLoginPhoneInput(event.target)) return;
      configure(event.target);
      const next = normalizePhoneInput(event.target.value);
      if (event.target.value !== next) {
        const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
        setter?.call(event.target, next);
      }
    };
    configureVisibleInputs();
    document.addEventListener('focusin', sanitize, true);
    document.addEventListener('input', sanitize, true);
    const observer = new MutationObserver(configureVisibleInputs);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => {
      document.removeEventListener('focusin', sanitize, true);
      document.removeEventListener('input', sanitize, true);
      observer.disconnect();
    };
  }, []);

  return null;
}

export { normalizePhoneInput };
