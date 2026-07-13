#!/usr/bin/env node

const required = [
  "NODE_ENV",
  "DATABASE_URL",
  "REDIS_URL",
  "JWT_SECRET",
  "DELIVERY_OTP_SECRET",
  "RIDER_BANK_ENCRYPTION_KEY",
  "R2_ENDPOINT",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_EVIDENCE_BUCKET_NAME",
];

const recommended = ["CORS_ORIGINS"];

const missing = required.filter(
  (key) => !process.env[key] || process.env[key]?.trim() === ""
);
const weak = [];

if (process.env.NODE_ENV && process.env.NODE_ENV !== "production") {
  weak.push("NODE_ENV must be production for production start");
}

if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
  weak.push("JWT_SECRET must be at least 32 characters");
}

if (
  process.env.RIDER_BANK_ENCRYPTION_KEY &&
  process.env.RIDER_BANK_ENCRYPTION_KEY.length < 32
) {
  weak.push("RIDER_BANK_ENCRYPTION_KEY must be at least 32 characters");
}

if (
  process.env.RIDER_BANK_ENCRYPTION_KEY &&
  process.env.RIDER_BANK_ENCRYPTION_KEY === process.env.JWT_SECRET
) {
  weak.push("RIDER_BANK_ENCRYPTION_KEY must be different from JWT_SECRET");
}

if (
  process.env.DELIVERY_OTP_SECRET &&
  process.env.DELIVERY_OTP_SECRET.length < 32
) {
  weak.push("DELIVERY_OTP_SECRET must be at least 32 characters");
}

if (
  process.env.DELIVERY_OTP_SECRET &&
  [process.env.JWT_SECRET, process.env.RIDER_BANK_ENCRYPTION_KEY].includes(
    process.env.DELIVERY_OTP_SECRET
  )
) {
  weak.push(
    "DELIVERY_OTP_SECRET must be different from JWT_SECRET and RIDER_BANK_ENCRYPTION_KEY"
  );
}

if (
  process.env.DATABASE_URL &&
  /localhost|127\.0\.0\.1/i.test(process.env.DATABASE_URL)
) {
  weak.push(
    "DATABASE_URL points to localhost; do not use local DB for production"
  );
}

if (
  process.env.REDIS_URL &&
  /localhost|127\.0\.0\.1/i.test(process.env.REDIS_URL)
) {
  weak.push(
    "REDIS_URL points to localhost; do not use local Redis for production"
  );
}

const warnings = recommended.filter(
  (key) => !process.env[key] || process.env[key]?.trim() === ""
);

if (missing.length || weak.length) {
  console.error("Production environment validation failed.");
  for (const key of missing) console.error(`Missing required env: ${key}`);
  for (const item of weak) console.error(`Invalid env: ${item}`);
  process.exit(1);
}

if (warnings.length) {
  for (const key of warnings) console.warn(`Recommended env not set: ${key}`);
}

console.log("Production environment validation passed.");
