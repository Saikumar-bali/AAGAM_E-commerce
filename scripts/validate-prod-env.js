#!/usr/bin/env node

const required = [
  'NODE_ENV',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'CORS_ORIGINS',
  'NEXT_PUBLIC_API_URL',
];

const missing = required.filter((key) => !process.env[key] || process.env[key]?.trim() === '');
const weak = [];

if (process.env.NODE_ENV && process.env.NODE_ENV !== 'production') {
  weak.push('NODE_ENV must be production for production start');
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  weak.push('JWT_SECRET must be at least 32 characters');
}

if (process.env.DATABASE_URL && /localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL)) {
  weak.push('DATABASE_URL points to localhost; do not use local DB for production');
}

if (process.env.REDIS_URL && /localhost|127\.0\.0\.1/i.test(process.env.REDIS_URL)) {
  weak.push('REDIS_URL points to localhost; do not use local Redis for production');
}

if (process.env.CORS_ORIGINS) {
  const origins = process.env.CORS_ORIGINS.split(',').map((origin) => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.includes('*')) {
    weak.push('CORS_ORIGINS must contain explicit allowed origins; wildcard is not allowed');
  }
  for (const origin of origins) {
    try {
      const parsed = new URL(origin);
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin.replace(/\/$/, '')) {
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
      weak.push('NEXT_PUBLIC_API_URL points to localhost; browser clients cannot use it in production');
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
