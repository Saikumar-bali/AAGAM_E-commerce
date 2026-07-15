#!/usr/bin/env node

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const LIVE = process.argv.includes('--live') || process.env.DEPLOY_PREP_LIVE === 'true';
const API_URL = process.env.DEPLOY_PREP_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

const requiredFiles = [
  'package.json',
  'apps/api-gateway/package.json',
  'apps/admin-dashboard/package.json',
  '.env.production.example',
  'deployment/API_ENV.example',
  'deployment/ADMIN_ENV.example',
  'docs/DEPLOYMENT_RUNBOOK.md',
  'scripts/predeploy-readiness-audit.js',
];

const requiredRootScripts = [
  'build:api',
  'build:admin',
  'start:api',
  'start:admin',
  'check:env:prod',
  'predeploy:audit',
  'predeploy:audit:live',
  'deploy:prep',
  'deploy:prep:live',
];

const requiredApiEnvKeys = [
  'NODE_ENV',
  'PORT',
  'DATABASE_URL',
  'REDIS_URL',
  'JWT_SECRET',
  'CORS_ORIGINS',
];

const requiredAdminEnvKeys = [
  'NODE_ENV',
  'PORT',
  'NEXT_PUBLIC_API_URL',
];

function read(file) {
  return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function readJson(file) {
  return JSON.parse(read(file));
}

function exists(file) {
  return fs.existsSync(path.join(ROOT, file));
}

function contains(file, text) {
  return exists(file) && read(file).includes(text);
}

function probe(url) {
  return new Promise((resolve) => {
    const client = url.startsWith('https:') ? https : http;
    const req = client.get(url, { timeout: 4000 }, (res) => {
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

  for (const file of requiredFiles) {
    if (!exists(file)) failures.push(`Missing file: ${file}`);
  }

  const rootPkg = readJson('package.json');
  const apiPkg = readJson('apps/api-gateway/package.json');
  const adminPkg = readJson('apps/admin-dashboard/package.json');

  for (const script of requiredRootScripts) {
    if (!rootPkg.scripts?.[script]) failures.push(`Missing root script: ${script}`);
  }

  if (!apiPkg.scripts?.['start:prod']) failures.push('API package is missing start:prod script');
  if (!adminPkg.scripts?.['start:railway']) failures.push('Admin package is missing start:railway script');

  for (const key of requiredApiEnvKeys) {
    if (!contains('deployment/API_ENV.example', `${key}=`)) failures.push(`API env example missing key: ${key}`);
  }

  for (const key of requiredAdminEnvKeys) {
    if (!contains('deployment/ADMIN_ENV.example', `${key}=`)) failures.push(`Admin env example missing key: ${key}`);
  }

  if (!contains('packages/utils/src/api-client.ts', 'NEXT_PUBLIC_API_URL')) {
    failures.push('Admin/client API package does not use NEXT_PUBLIC_API_URL');
  }

  if (contains('deployment/API_ENV.example', 'localhost')) {
    warnings.push('API_ENV.example contains localhost only in comments/placeholders; never use localhost in production secrets');
  }

  const result = {
    status: failures.length ? 'failed' : 'passed',
    mode: LIVE ? 'static+live' : 'static',
    failures,
    warnings,
    checked: {
      files: requiredFiles,
      rootScripts: requiredRootScripts,
      apiEnvKeys: requiredApiEnvKeys,
      adminEnvKeys: requiredAdminEnvKeys,
    },
    liveChecks: [],
  };

  if (LIVE) {
    const endpoints = ['/health', '/ready', '/ready/realtime'];
    result.liveChecks = await Promise.all(endpoints.map((endpoint) => probe(new URL(endpoint, API_URL).toString())));
    for (const check of result.liveChecks) {
      if (!check.ok) failures.push(`Live API check failed: ${check.url}`);
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
