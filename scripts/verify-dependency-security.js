#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

const ALLOWED_PATCHED_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

// The only audit exceptions are vendor-unfixed image-size parser CVEs. They are
// accepted only when the exact local patch is present and exploit regressions
// terminate safely.
run(process.execPath, ['scripts/patch-image-size-cves.js', '--verify']);
run(process.execPath, ['scripts/test-image-size-cve-patch.js']);

let auditOutput;
try {
  auditOutput = run(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['audit', '--package-lock-only', '--json']);
} catch (error) {
  auditOutput = String(error.stdout || '');
  if (!auditOutput.trim()) {
    process.stderr.write(String(error.stderr || error.message || error));
    process.exit(1);
  }
}

let report;
try {
  report = JSON.parse(auditOutput);
} catch (error) {
  console.error('Unable to parse npm audit JSON:', error.message);
  process.exit(1);
}

const vulnerabilities = report.vulnerabilities || {};
const memo = new Map();

function advisoryUrlsFor(name, visiting = new Set()) {
  if (memo.has(name)) return memo.get(name);
  const vulnerability = vulnerabilities[name];
  if (!vulnerability) return new Set();
  if (visiting.has(name)) return new Set();

  const nextVisiting = new Set(visiting);
  nextVisiting.add(name);
  const urls = new Set();

  for (const via of vulnerability.via || []) {
    if (typeof via === 'object' && via && typeof via.url === 'string') {
      urls.add(via.url);
      continue;
    }
    if (typeof via === 'string') {
      if (!vulnerabilities[via]) {
        urls.add(`unresolved:${via}`);
        continue;
      }
      for (const url of advisoryUrlsFor(via, nextVisiting)) urls.add(url);
    }
  }

  memo.set(name, urls);
  return urls;
}

const blocked = [];
const compensated = [];
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const urls = advisoryUrlsFor(name);
  const urlList = [...urls];
  const isCompensated =
    urlList.length > 0 &&
    urlList.every((url) => ALLOWED_PATCHED_ADVISORIES.has(url));

  if (isCompensated) {
    compensated.push({ name, severity: vulnerability.severity, urls: urlList });
  } else {
    blocked.push({ name, severity: vulnerability.severity, urls: urlList });
  }
}

if (blocked.length > 0) {
  console.error('Unmitigated npm advisories remain:');
  for (const item of blocked) {
    console.error(`- ${item.name} [${item.severity}] ${item.urls.join(', ') || '(no resolved advisory URL)'}`);
  }
  process.exit(1);
}

const directImageSize = vulnerabilities['image-size'];
if (!directImageSize) {
  console.log('npm audit reports no vulnerabilities. Local image-size patch remains fail-closed until the dependency is upgraded/removed.');
} else {
  const directUrls = advisoryUrlsFor('image-size');
  if (
    directUrls.size !== ALLOWED_PATCHED_ADVISORIES.size ||
    [...ALLOWED_PATCHED_ADVISORIES].some((url) => !directUrls.has(url))
  ) {
    console.error('image-size audit exception no longer matches the exact two reviewed advisories.');
    process.exit(1);
  }
  console.log(`All remaining npm audit entries (${compensated.length}) derive only from the two locally patched image-size CVEs.`);
}

console.log('Dependency security policy passed: no unmitigated npm advisory remains.');
