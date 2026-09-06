#!/usr/bin/env node
'use strict';

const { execFileSync } = require('child_process');

const ALLOWED_PATCHED_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
  'https://github.com/advisories/GHSA-vcc3-ghjq-m6fr',
  'https://github.com/advisories/GHSA-5jgf-p345-68v8',
  'https://github.com/advisories/GHSA-f65p-4m7j-42xc',
  'https://github.com/advisories/GHSA-fph4-wmhf-6fwf',
  'https://github.com/advisories/GHSA-jqff-g426-hqxp',
  'https://github.com/advisories/GHSA-x5fp-wj9c-mxmx',
  'https://github.com/advisories/GHSA-4mjr-xmp4-gh2g',
  'https://github.com/advisories/GHSA-w5hq-g745-h8pq',
]);

function run(command, args, options = {}) {
  return execFileSync(command, args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    ...options,
  });
}

// Prove the reviewed transitive UUID major override still resolves the same
// v4 API used by Google's HTTP helpers before trusting the audit result.
run(process.execPath, ['scripts/test-google-uuid-security-override.js']);

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
const names = Object.keys(vulnerabilities);
const advisoryUrls = new Map(names.map((name) => [name, new Set()]));
const unresolvedVia = new Map(names.map((name) => [name, new Set()]));

// Seed each node with advisories attached directly by npm. Keep unknown string
// dependencies fail-closed instead of silently treating them as compensated.
for (const name of names) {
  for (const via of vulnerabilities[name].via || []) {
    if (typeof via === 'object' && via && typeof via.url === 'string') {
      advisoryUrls.get(name).add(via.url);
    } else if (typeof via === 'string' && !vulnerabilities[via]) {
      unresolvedVia.get(name).add(via);
    }
  }
}

// npm audit dependency graphs may contain cycles (for example Metro packages).
// Propagate advisory URLs to a fixed point so cycles cannot hide the root CVE.
let changed = true;
let passes = 0;
const maxPasses = Math.max(1, names.length * names.length + 1);
while (changed && passes < maxPasses) {
  changed = false;
  passes += 1;

  for (const name of names) {
    const target = advisoryUrls.get(name);
    for (const via of vulnerabilities[name].via || []) {
      if (typeof via !== 'string' || !vulnerabilities[via]) continue;
      for (const url of advisoryUrls.get(via)) {
        if (!target.has(url)) {
          target.add(url);
          changed = true;
        }
      }
      for (const unresolved of unresolvedVia.get(via)) {
        if (!unresolvedVia.get(name).has(unresolved)) {
          unresolvedVia.get(name).add(unresolved);
          changed = true;
        }
      }
    }
  }
}

if (changed) {
  console.error('Dependency advisory graph did not converge; refusing to allow audit exceptions.');
  process.exit(1);
}

const blocked = [];
const compensated = [];
for (const [name, vulnerability] of Object.entries(vulnerabilities)) {
  const urls = advisoryUrls.get(name);
  const unknown = unresolvedVia.get(name);
  const urlList = [...urls];
  const unknownList = [...unknown];
  const isCompensated =
    unknownList.length === 0 &&
    urlList.length > 0 &&
    urlList.every((url) => ALLOWED_PATCHED_ADVISORIES.has(url));

  if (isCompensated) {
    compensated.push({ name, severity: vulnerability.severity, urls: urlList });
  } else {
    blocked.push({ name, severity: vulnerability.severity, urls: urlList, unknown: unknownList });
  }
}

if (blocked.length > 0) {
  console.error('Unmitigated npm advisories remain:');
  for (const item of blocked) {
    const details = [
      ...item.urls,
      ...item.unknown.map((name) => `unresolved:${name}`),
    ];
    console.error(`- ${item.name} [${item.severity}] ${details.join(', ') || '(no resolved advisory URL)'}`);
  }
  process.exit(1);
}

const IMAGE_SIZE_ONLY_ADVISORIES = new Set([
  'https://github.com/advisories/GHSA-w3rx-r6r6-pgpr',
  'https://github.com/advisories/GHSA-5p2g-fcmc-qvqq',
]);

const directImageSize = vulnerabilities['image-size'];
if (!directImageSize) {
  console.log('npm audit reports no vulnerabilities. Local image-size patch remains fail-closed until the dependency is upgraded/removed.');
} else {
  const directUrls = advisoryUrls.get('image-size');
  if (
    directUrls.size !== IMAGE_SIZE_ONLY_ADVISORIES.size ||
    [...IMAGE_SIZE_ONLY_ADVISORIES].some((url) => !directUrls.has(url))
  ) {
    console.error('image-size audit exception no longer matches the exact two reviewed advisories.');
    process.exit(1);
  }
  console.log(`All remaining npm audit entries (${compensated.length}) derive only from the two locally patched image-size CVEs.`);
}

console.log('Dependency security policy passed: no unmitigated npm advisory remains.');
