import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  createAsyncRequestLock,
  discoverCustomerPhoneOtp,
  resendCustomerPhoneOtp,
} from './customerPhoneOtpFlow.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const loginSource = readFileSync(path.join(here, '../screens/LoginScreen.tsx'), 'utf8');
const navigatorSource = readFileSync(path.join(here, '../navigation/RootNavigator.tsx'), 'utf8');

const challenge = (maskedDestination = '+91*******42') => ({
  channel: 'PHONE',
  maskedDestination,
  expiresAt: '2026-07-20T10:00:00.000Z',
});

const statusError = (status, message = `HTTP ${status}`) =>
  Object.assign(new Error(message), { status });

test('first-time customer requests SIGNUP only and receives the OTP step', async () => {
  const calls = [];
  const result = await discoverCustomerPhoneOtp(async (_phone, purpose) => {
    calls.push(purpose);
    return challenge();
  }, '+919999999942');

  assert.deepEqual(calls, ['SIGNUP']);
  assert.equal(result.purpose, 'SIGNUP');
  assert.equal(result.isNewCustomer, true);
});

test('existing customer falls back from SIGNUP 409 to LOGIN exactly once', async () => {
  const calls = [];
  const result = await discoverCustomerPhoneOtp(async (_phone, purpose) => {
    calls.push(purpose);
    if (purpose === 'SIGNUP') throw statusError(409);
    return challenge();
  }, '+919999999942');

  assert.deepEqual(calls, ['SIGNUP', 'LOGIN']);
  assert.equal(result.purpose, 'LOGIN');
  assert.equal(result.isNewCustomer, false);
});

test('a signup server error never falls back to LOGIN', async () => {
  const calls = [];
  const failure = statusError(500, 'Service unavailable');

  await assert.rejects(
    discoverCustomerPhoneOtp(async (_phone, purpose) => {
      calls.push(purpose);
      throw failure;
    }, '+919999999942'),
    (error) => error === failure,
  );
  assert.deepEqual(calls, ['SIGNUP']);
});

test('a signup network error never falls back to LOGIN', async () => {
  const calls = [];
  const failure = Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });

  await assert.rejects(
    discoverCustomerPhoneOtp(async (_phone, purpose) => {
      calls.push(purpose);
      throw failure;
    }, '+919999999942'),
    (error) => error === failure,
  );
  assert.deepEqual(calls, ['SIGNUP']);
});

test('signup rate limiting never falls back to LOGIN', async () => {
  const calls = [];

  await assert.rejects(
    discoverCustomerPhoneOtp(async (_phone, purpose) => {
      calls.push(purpose);
      throw statusError(429);
    }, '+919999999942'),
    { status: 429 },
  );
  assert.deepEqual(calls, ['SIGNUP']);
});

test('a non-conflict client error never falls back to LOGIN', async () => {
  const calls = [];

  await assert.rejects(
    discoverCustomerPhoneOtp(async (_phone, purpose) => {
      calls.push(purpose);
      throw statusError(400);
    }, '+919999999942'),
    { status: 400 },
  );
  assert.deepEqual(calls, ['SIGNUP']);
});

test('LOGIN failure after an existing-phone conflict does not loop', async () => {
  const calls = [];

  await assert.rejects(
    discoverCustomerPhoneOtp(async (_phone, purpose) => {
      calls.push(purpose);
      if (purpose === 'SIGNUP') throw statusError(409);
      throw statusError(404);
    }, '+919999999942'),
    { status: 404 },
  );
  assert.deepEqual(calls, ['SIGNUP', 'LOGIN']);
});

test('resend uses the resolved SIGNUP purpose directly', async () => {
  const calls = [];
  await resendCustomerPhoneOtp(async (_phone, purpose) => {
    calls.push(purpose);
    return challenge();
  }, '+919999999942', 'SIGNUP');

  assert.deepEqual(calls, ['SIGNUP']);
});

test('resend uses the resolved LOGIN purpose directly', async () => {
  const calls = [];
  await resendCustomerPhoneOtp(async (_phone, purpose) => {
    calls.push(purpose);
    return challenge();
  }, '+919999999942', 'LOGIN');

  assert.deepEqual(calls, ['LOGIN']);
});

test('request lock rejects concurrent duplicate submissions and unlocks afterward', async () => {
  const lock = createAsyncRequestLock();
  let executions = 0;
  let release;
  const blocked = new Promise((resolve) => { release = resolve; });

  const first = lock.run(async () => {
    executions += 1;
    await blocked;
    return 'first';
  });
  const duplicate = lock.run(async () => {
    executions += 1;
    return 'duplicate';
  });

  assert.equal(await duplicate, undefined);
  assert.equal(executions, 1);
  release();
  assert.equal(await first, 'first');
  assert.equal(await lock.run(async () => 'next'), 'next');
});

test('separate request and verification locks prevent both duplicate paths', async () => {
  const requestLock = createAsyncRequestLock();
  const verificationLock = createAsyncRequestLock();
  let requestCount = 0;
  let verificationCount = 0;
  let releaseRequest;
  let releaseVerification;

  const requestPending = new Promise((resolve) => { releaseRequest = resolve; });
  const verificationPending = new Promise((resolve) => { releaseVerification = resolve; });

  const send = requestLock.run(async () => { requestCount += 1; await requestPending; });
  const sendAgain = requestLock.run(async () => { requestCount += 1; });
  const autoVerify = verificationLock.run(async () => { verificationCount += 1; await verificationPending; });
  const manualVerify = verificationLock.run(async () => { verificationCount += 1; });

  assert.equal(await sendAgain, undefined);
  assert.equal(await manualVerify, undefined);
  assert.equal(requestCount, 1);
  assert.equal(verificationCount, 1);

  releaseRequest();
  releaseVerification();
  await Promise.all([send, autoVerify]);
});

test('customer login renders a production-ready profile and OTP flow', () => {
  assert.match(loginSource, /ScrollView/);
  assert.match(loginSource, /keyboardShouldPersistTaps="handled"/);
  assert.match(loginSource, /Complete your profile/);
  assert.match(loginSource, /Verify and create account/);
  assert.match(loginSource, /Change mobile number/);
  assert.match(loginSource, /if \(isNewCustomer\) profileNameRef\.current\?\.focus\(\)/);
  assert.match(loginSource, /else otpInputRef\.current\?\.focus\(\)/);
  assert.match(loginSource, /We'll send a secure OTP to verify your mobile number\./);
  assert.doesNotMatch(loginSource, /New customers receive a signup OTP automatically/);
  assert.doesNotMatch(loginSource, /NEW CUSTOMER|EXISTING CUSTOMER/);
  assert.doesNotMatch(loginSource, /navigation\.navigate\('SignUp'/);
});

test('customer navigator never unmounts auth screens for request loading', () => {
  assert.match(navigatorSource, /useAuthStore\(\(state\) => state\.user\)/);
  assert.match(navigatorSource, /useAuthStore\(\(state\) => state\.initialize\)/);
  assert.doesNotMatch(navigatorSource, /\bisLoading\b/);
  assert.doesNotMatch(navigatorSource, /const\s*\{[^}]*isLoading[^}]*\}\s*=\s*useAuthStore\(\)/s);
});

test('customer navigator gates only on one-time secure-session initialization', () => {
  assert.match(navigatorSource, /const \[isInitializing, setIsInitializing\] = useState\(true\)/);
  assert.match(navigatorSource, /initialize\(\)\.finally\(\(\) =>/);
  assert.match(navigatorSource, /if \(mounted\) setIsInitializing\(false\)/);
  assert.match(navigatorSource, /if \(isInitializing\)/);
});
