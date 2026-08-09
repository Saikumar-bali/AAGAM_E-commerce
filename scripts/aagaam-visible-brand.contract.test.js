const { readFileSync, readdirSync, statSync } = require('node:fs');
const { extname, relative, resolve } = require('node:path');
const assert = require('node:assert/strict');

const root = resolve(__dirname, '..');
const read = (path) => readFileSync(resolve(root, path), 'utf8');
const sourceRoots = [
  'apps/admin-dashboard/src',
  'apps/mobile-customer/src',
  'apps/mobile-partners/src',
  'apps/mobile-customer/android/app/src/main',
  'apps/mobile-partners/android/app/src/main',
];
const sourceExtensions = new Set(['.ts', '.tsx', '.kt', '.java', '.xml']);
const legacyBrand = /\b(?:AAGAM|Aagam)\b/g;

// Technical identifiers such as AagamLogo, AagamBrand, AagamCustomer,
// AagamPartners and native-module names are not standalone words, so the
// boundary-aware scan ignores them automatically. This is the only remaining
// intentional standalone legacy value: an existing Android media folder path.
const standaloneAllowlist = new Map([
  [
    'apps/mobile-partners/android/app/src/main/java/com/aagampartners/PartnerDocumentPickerModule.kt',
    ['Pictures/AAGAM Partners'],
  ],
]);

function walk(directory) {
  return readdirSync(directory).flatMap((entry) => {
    const absolute = resolve(directory, entry);
    return statSync(absolute).isDirectory() ? walk(absolute) : [absolute];
  });
}

const violations = [];
for (const sourceRoot of sourceRoots) {
  for (const absolute of walk(resolve(root, sourceRoot))) {
    if (!sourceExtensions.has(extname(absolute))) continue;
    const repositoryPath = relative(root, absolute).replaceAll('\\', '/');
    const allowedFragments = standaloneAllowlist.get(repositoryPath) || [];
    readFileSync(absolute, 'utf8').split(/\r?\n/).forEach((line, index) => {
      legacyBrand.lastIndex = 0;
      if (!legacyBrand.test(line)) return;
      const allowed = allowedFragments.some((fragment) => line.includes(fragment));
      if (!allowed) violations.push(`${repositoryPath}:${index + 1}: ${line.trim()}`);
    });
  }
}

assert.deepEqual(
  violations,
  [],
  `Controlled presentation source contains legacy standalone branding:\n${violations.join('\n')}`,
);
assert.ok(
  read('apps/admin-dashboard/src/app/page.tsx').includes('href="/login?returnTo=%2Fshop%2Fsupport">Customer support'),
  'The public Customer support link must preserve the support destination through authentication.',
);
assert.ok(
  read('apps/mobile-partners/android/app/src/main/java/com/aagampartners/PartnerDocumentPickerModule.kt').includes('Pictures/AAGAM Partners'),
  'The existing internal Android media path must remain unchanged.',
);
assert.ok(
  read('apps/mobile-partners/android/app/src/main/AndroidManifest.xml').includes('aagam_priority_operations_v3'),
  'The internal notification channel must retain the AAGAM namespace while allowing sound-profile versioning.',
);

console.log('Aagaam visible brand contracts passed.');
