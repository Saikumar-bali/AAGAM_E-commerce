#!/usr/bin/env node

const { chmodSync, readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');

function fail(message) {
  console.error(`Production environment preparation failed: ${message}`);
  process.exit(1);
}

function decodeBase64(value, label) {
  const normalized = String(value || '').replace(/\s+/g, '');
  if (!normalized) fail(`${label} is empty`);
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(normalized) || normalized.length % 4 !== 0) {
    fail(`${label} is not valid base64`);
  }

  const decoded = Buffer.from(normalized, 'base64');
  if (!decoded.length) fail(`${label} decoded to an empty value`);
  return decoded;
}

function validateServiceAccount(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    fail('Firebase service-account secret must contain valid JSON');
  }

  for (const key of ['project_id', 'client_email', 'private_key']) {
    if (typeof parsed?.[key] !== 'string' || !parsed[key].trim()) {
      fail(`Firebase service-account secret is missing ${key}`);
    }
  }

  return JSON.stringify(parsed);
}

function shellSingleQuote(value) {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

const outputArg = process.argv[2];
if (!outputArg) fail('output path argument is required');

const rawBaseEnv = process.env.PRODUCTION_ENV_FILE_B64;
if (!rawBaseEnv) fail('PRODUCTION_ENV_FILE_B64 is required');

const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_SECRET?.trim();
const base64Json = process.env.FIREBASE_SERVICE_ACCOUNT_JSON_B64?.trim();
if (rawJson && base64Json) {
  fail('configure only one of FIREBASE_SERVICE_ACCOUNT_JSON_SECRET or FIREBASE_SERVICE_ACCOUNT_JSON_B64');
}

let envFile = decodeBase64(rawBaseEnv, 'PRODUCTION_ENV_FILE_B64').toString('utf8').replace(/\r\n/g, '\n');
if (!envFile.trim()) fail('PRODUCTION_ENV_FILE_B64 decoded to an empty environment file');
if (!envFile.endsWith('\n')) envFile += '\n';

let serviceAccountJson;
if (rawJson) {
  serviceAccountJson = validateServiceAccount(rawJson);
} else if (base64Json) {
  serviceAccountJson = validateServiceAccount(
    decodeBase64(base64Json, 'FIREBASE_SERVICE_ACCOUNT_JSON_B64').toString('utf8'),
  );
}

if (serviceAccountJson) {
  envFile += `\n# Managed by GitHub production deployment. This final assignment overrides earlier values.\n`;
  envFile += `FIREBASE_SERVICE_ACCOUNT_JSON=${shellSingleQuote(serviceAccountJson)}\n`;
}

const outputPath = resolve(outputArg);
writeFileSync(outputPath, envFile, { encoding: 'utf8', mode: 0o600 });
chmodSync(outputPath, 0o600);

// Validate that the generated file is readable without ever printing its contents.
readFileSync(outputPath, 'utf8');
console.log(`Prepared production environment file at ${outputPath}`);
