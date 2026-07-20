import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, 'LoginScreen.tsx'), 'utf8');

test('customer login renders a dedicated scrollable OTP step', () => {
  assert.match(source, /ScrollView/);
  assert.match(source, /keyboardShouldPersistTaps="handled"/);
  assert.match(source, /NEW CUSTOMER/);
  assert.match(source, /Verify and create account/);
  assert.match(source, /Change mobile number/);
});

test('new-customer challenge focuses profile details instead of the hidden OTP input', () => {
  assert.match(source, /if \(isNewCustomer\) profileNameRef\.current\?\.focus\(\)/);
  assert.match(source, /else otpInputRef\.current\?\.focus\(\)/);
});

test('screen uses one automatic phone entry instead of a separate signup navigation', () => {
  assert.match(source, /New customers receive a signup OTP automatically/);
  assert.doesNotMatch(source, /navigation\.navigate\('SignUp'/);
});
