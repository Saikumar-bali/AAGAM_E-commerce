#!/usr/bin/env node

const required = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'CORS_ORIGINS',
  'NEXT_PUBLIC_API_URL',
];

const verificationRequired =
  process.env.NODE_ENV === 'production' &&
  (process.env.CI !== 'true' || process.env.FORCE_VERIFICATION_ENV_VALIDATION === 'true');
const closedAppPushRequired =
  process.env.NODE_ENV === 'production' &&
  (process.env.CI !== 'true' || process.env.REQUIRE_CLOSED_APP_PUSH === 'true');

const emailProvider = (process.env.PARTNER_EMAIL_PROVIDER || '').trim().toUpperCase();
const phoneMode = (process.env.PARTNER_PHONE_VERIFICATION_MODE || '').trim().toUpperCase();

if (verificationRequired) {
  required.push(
    'PARTNER_EMAIL_PROVIDER',
    'PARTNER_VERIFICATION_FROM_EMAIL',
    'PARTNER_PHONE_VERIFICATION_MODE',
  );

  if (emailProvider === 'MAILJET') {
    required.push('MAILJET_API_KEY', 'MAILJET_SECRET_KEY');
  } else if (emailProvider === 'RESEND') {
    required.push('RESEND_API_KEY');
  }

  if (phoneMode !== 'EMAIL_ONLY') {
    required.push(
      'TWILIO_ACCOUNT_SID',
      'TWILIO_AUTH_TOKEN',
      'TWILIO_FROM_PHONE',
      'FIREBASE_PROJECT_ID',
      'FIREBASE_PROJECT_NUMBER',
      'PARTNER_SMS_PROVIDER',
    );
  }
}

if (closedAppPushRequired) {
  required.push('FIREBASE_SERVICE_ACCOUNT_JSON');
}

const missing = required.filter(
  (key) => !process.env[key] || process.env[key].trim() === '',
);
const weak = [];

if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production') {
  weak.push('NODE_ENV must be production for production start');
}
if (process.env.NODE_ENV === 'production' && process.env.PLAYWRIGHT_QA !== undefined) {
  weak.push('PLAYWRIGHT_QA must not be set when NODE_ENV=production');
}
if (
  process.env.NODE_ENV === 'production' &&
  process.env.PARTNER_QA_VERIFICATION_CODE !== undefined
) {
  weak.push('PARTNER_QA_VERIFICATION_CODE must not be set when NODE_ENV=production');
}
if (
  process.env.PARTNER_EMAIL_PROVIDER &&
  !['MAILJET', 'RESEND'].includes(emailProvider)
) {
  weak.push('PARTNER_EMAIL_PROVIDER must be MAILJET or RESEND');
}
if (
  process.env.PARTNER_PHONE_VERIFICATION_MODE &&
  !['EMAIL_ONLY', 'PNV_FIRST'].includes(phoneMode)
) {
  weak.push('PARTNER_PHONE_VERIFICATION_MODE must be EMAIL_ONLY or PNV_FIRST');
}
if (
  phoneMode !== 'EMAIL_ONLY' &&
  process.env.PARTNER_SMS_PROVIDER &&
  process.env.PARTNER_SMS_PROVIDER !== 'TWILIO'
) {
  weak.push('PARTNER_SMS_PROVIDER must be TWILIO');
}
if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  weak.push('JWT_SECRET must be at least 32 characters');
}
if (
  process.env.FIREBASE_PROJECT_NUMBER &&
  !/^\d+$/.test(process.env.FIREBASE_PROJECT_NUMBER)
) {
  weak.push('FIREBASE_PROJECT_NUMBER must contain digits only');
}

if (process.env.FIREBASE_SERVICE_ACCOUNT_JSON) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    for (const key of ['project_id', 'client_email', 'private_key']) {
      if (typeof serviceAccount?.[key] !== 'string' || !serviceAccount[key].trim()) {
        weak.push(`FIREBASE_SERVICE_ACCOUNT_JSON is missing ${key}`);
      }
    }
    if (
      process.env.FIREBASE_PROJECT_ID &&
      serviceAccount?.project_id &&
      process.env.FIREBASE_PROJECT_ID.trim() !== serviceAccount.project_id.trim()
    ) {
      weak.push('FIREBASE_SERVICE_ACCOUNT_JSON project_id must match FIREBASE_PROJECT_ID');
    }
  } catch {
    weak.push('FIREBASE_SERVICE_ACCOUNT_JSON must contain valid JSON');
  }
}

if (process.env.PARTNER_VERIFICATION_FROM_EMAIL) {
  const raw = process.env.PARTNER_VERIFICATION_FROM_EMAIL.trim();
  const bracketed = raw.match(/^\s*(.*?)\s*<\s*([^<>\s]+@[^<>\s]+)\s*>\s*$/);
  const email = (bracketed?.[2] || raw).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    weak.push('PARTNER_VERIFICATION_FROM_EMAIL must contain a valid email address');
  }
}

for (const [key, protocols] of [
  ['DATABASE_URL', ['postgres:', 'postgresql:']],
  ['REDIS_URL', ['redis:', 'rediss:']],
]) {
  if (!process.env[key]) continue;
  try {
    const parsed = new URL(process.env[key]);
    if (!protocols.includes(parsed.protocol)) {
      weak.push(`${key} uses an invalid protocol`);
    }
  } catch {
    weak.push(`${key} must be a valid URL`);
  }
}

if (process.env.CORS_ORIGINS) {
  const origins = process.env.CORS_ORIGINS.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!origins.length || origins.includes('*')) {
    weak.push('CORS_ORIGINS must contain explicit allowed origins; wildcard is not allowed');
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (
        !['http:', 'https:'].includes(parsed.protocol) ||
        parsed.origin !== origin.replace(/\/$/, '')
      ) {
        weak.push(`CORS_ORIGINS contains an invalid origin: ${origin}`);
      }
    } catch {
      weak.push(`CORS_ORIGINS contains an invalid origin: ${origin}`);
    }
  }
}

if (process.env.NEXT_PUBLIC_API_URL) {
  try {
    const parsed = new URL(process.env.NEXT_PUBLIC_API_URL);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      weak.push('NEXT_PUBLIC_API_URL must use http or https');
    }
    if (/localhost|127\.0\.0\.1/i.test(parsed.hostname)) {
      weak.push(
        'NEXT_PUBLIC_API_URL points to localhost; browser clients cannot use it in production',
      );
    }
  } catch {
    weak.push('NEXT_PUBLIC_API_URL must be a valid absolute URL');
  }
}

if (missing.length || weak.length) {
  console.error('Production environment validation failed.');
  for (const key of missing) console.error(`Missing required env: ${key}`);
  for (const item of weak) console.error(`Invalid env: ${item}`);
  process.exit(1);
}

console.log('Production environment validation passed.');
