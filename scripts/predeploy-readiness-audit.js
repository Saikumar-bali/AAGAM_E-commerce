#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIVE = process.argv.includes('--live') || process.env.PREDEPLOY_LIVE === 'true';
const BASE_URL = process.env.PREDEPLOY_BASE_URL || 'http://localhost:3005';

const requiredRootScripts = [
  'check:env:prod',
  'db:migrate:prod',
  'railway:start:api',
  'ci:api',
  'test',
  'test:api-smoke',
  'build:api',
  'build:admin',
];

const requiredApiScripts = [
  'test',
  'test:ci',
  'test:api-smoke',
  'test:phase9',
  'test:phase10',
  'test:phase11',
  'test:phase12',
];

const requiredFiles = [
  'scripts/validate-prod-env.js',
  '.env.production.example',
  'apps/api-gateway/src/app.controller.ts',
  'apps/api-gateway/scripts/run-api-smoke-if-online.js',
  'docs/PHASE_13_QA_HARDENING.md',
];

const requiredEnvTemplateKeys = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'RIDER_BANK_ENCRYPTION_KEY',
  'R2_ENDPOINT',
  'R2_ACCESS_KEY_ID',
  'R2_SECRET_ACCESS_KEY',
  'R2_EVIDENCE_BUCKET_NAME',
  'CORS_ORIGINS',
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function exists(relativePath) {
  return fs.existsSync(path.join(ROOT, relativePath));
}

function fileContains(relativePath, needle) {
  if (!exists(relativePath)) return false;
  return fs.readFileSync(path.join(ROOT, relativePath), 'utf8').includes(needle);
}

function probe(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => resolve({ url, statusCode: res.statusCode, ok: res.statusCode >= 200 && res.statusCode < 300, body: body.slice(0, 300) }));
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ url, statusCode: 0, ok: false, error: 'timeout' });
    });
    req.on('error', (error) => resolve({ url, statusCode: 0, ok: false, error: error.message }));
  });
}

async function main() {
  const failures = [];
  const warnings = [];
  const rootPkg = readJson('package.json');
  const apiPkg = readJson('apps/api-gateway/package.json');

  for (const script of requiredRootScripts) {
    if (!rootPkg.scripts?.[script]) failures.push(`Missing root package script: ${script}`);
  }

  for (const script of requiredApiScripts) {
    if (!apiPkg.scripts?.[script]) failures.push(`Missing API package script: ${script}`);
  }

  for (const file of requiredFiles) {
    if (!exists(file)) failures.push(`Missing readiness file: ${file}`);
  }

  for (const key of requiredEnvTemplateKeys) {
    if (!fileContains('.env.production.example', `${key}=`)) failures.push(`Missing env template key: ${key}`);
  }

  if (!fileContains('scripts/validate-prod-env.js', 'JWT_SECRET')) failures.push('Production env validator does not check JWT_SECRET');
  if (!fileContains('scripts/validate-prod-env.js', 'localhost')) failures.push('Production env validator does not reject localhost DB/Redis');
  if (!fileContains('apps/api-gateway/src/app.controller.ts', "@Get('health')")) failures.push('Missing /health endpoint');
  if (!fileContains('apps/api-gateway/src/app.controller.ts', "@Get('ready')")) failures.push('Missing /ready endpoint');
  if (!fileContains('apps/api-gateway/src/app.controller.ts', "@Get('ready/realtime')")) failures.push('Missing /ready/realtime endpoint');

  if (!fileContains('apps/api-gateway/package.json', 'testPathIgnorePatterns=api-smoke.spec.ts')) {
    warnings.push('Default API tests may still include api-smoke.spec.ts');
  }

  const result = {
    status: failures.length ? 'failed' : 'passed',
    mode: LIVE ? 'static+live' : 'static',
    failures,
    warnings,
    staticChecks: {
      rootScripts: requiredRootScripts,
      apiScripts: requiredApiScripts,
      files: requiredFiles,
      envTemplateKeys: requiredEnvTemplateKeys,
    },
    liveChecks: [],
  };

  if (LIVE) {
    const endpoints = ['/health', '/ready', '/ready/realtime'];
    result.liveChecks = await Promise.all(endpoints.map((endpoint) => probe(new URL(endpoint, BASE_URL).toString())));
    for (const check of result.liveChecks) {
      if (!check.ok) failures.push(`Live readiness endpoint failed: ${check.url}`);
    }
    result.status = failures.length ? 'failed' : 'passed';
  }

  console.log(JSON.stringify(result, null, 2));
  if (failures.length) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
