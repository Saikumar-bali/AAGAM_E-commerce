import test from 'node:test';
import assert from 'node:assert/strict';
import { getUserSafeError } from './notifyCore.ts';

test('extracts a string API message', () => {
  assert.equal(
    getUserSafeError({ response: { data: { message: 'The OTP has expired' } } }, 'Fallback'),
    'The OTP has expired',
  );
});

test('joins array validation messages', () => {
  assert.equal(
    getUserSafeError({ response: { data: { message: ['Name is required', 'Email is invalid'] } } }, 'Fallback'),
    'Name is required, Email is invalid',
  );
});

test('returns a readable network failure', () => {
  assert.equal(
    getUserSafeError({ code: 'ERR_NETWORK', message: 'Network Error' }, 'Fallback'),
    'Network unavailable. Check your internet connection and try again.',
  );
});

test('uses fallback for malformed error objects', () => {
  assert.equal(getUserSafeError({ response: { data: { message: { raw: true } } } }, 'Please try again.'), 'Please try again.');
});

test('does not expose raw SQL, Prisma, token, or stack details', () => {
  assert.equal(
    getUserSafeError({ response: { data: { message: 'Prisma SQLSTATE failure at AuthService (/srv/auth.ts:12:3)' } } }, 'Could not sign in.'),
    'Could not sign in.',
  );
  assert.equal(
    getUserSafeError({ message: 'Bearer secret-token-value' }, 'Could not sign in.'),
    'Could not sign in.',
  );
});

test('normalizes rate-limit errors', () => {
  assert.equal(
    getUserSafeError({ status: 429, message: 'Internal limiter details' }, 'Fallback'),
    'Too many attempts. Please wait a moment and try again.',
  );
});
