#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const EXPECTED_VERSION = '1.2.1';
const PATCH_MARKER = 'AAGAM_IMAGE_SIZE_CVE_PATCH';

function fail(message) {
  throw new Error(`[image-size security patch] ${message}`);
}

function resolvePackageRoot() {
  let packageJson;
  try {
    packageJson = require.resolve('image-size/package.json', { paths: [process.cwd()] });
  } catch (error) {
    fail(`Unable to resolve image-size/package.json: ${error instanceof Error ? error.message : String(error)}`);
  }
  return path.dirname(packageJson);
}

function readPackageVersion(root) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
  if (pkg.version !== EXPECTED_VERSION) {
    fail(`Expected image-size ${EXPECTED_VERSION}, found ${pkg.version}. Review the upstream advisory before changing this patch.`);
  }
}

function patchUtils(root, verifyOnly) {
  const file = path.join(root, 'dist', 'types', 'utils.js');
  if (!fs.existsSync(file)) fail(`Expected compiled file is missing: ${file}`);
  let source = fs.readFileSync(file, 'utf8');

  const vulnerable = /if \(input\.length - offset < boxSize\)\s*return;?/;
  const hardened = /if \(boxSize < 8 \|\| input\.length - offset < boxSize\)\s*return;?/;

  if (hardened.test(source)) return;
  if (verifyOnly) fail('Compiled utils.js is not patched.');
  if (!vulnerable.test(source)) {
    fail('Expected vulnerable readBox guard was not found. Refusing a blind patch.');
  }

  source = source.replace(
    vulnerable,
    `if (boxSize < 8 || input.length - offset < boxSize) return; // ${PATCH_MARKER}`,
  );
  fs.writeFileSync(file, source);
}

function patchIcns(root, verifyOnly) {
  const file = path.join(root, 'dist', 'types', 'icns.js');
  if (!fs.existsSync(file)) fail(`Expected compiled file is missing: ${file}`);
  let source = fs.readFileSync(file, 'utf8');

  const vulnerable = /imageOffset \+= imageHeader\[1\];/;
  const marker = `if (imageHeader[1] < 8) throw new TypeError('Invalid ICNS entry length'); // ${PATCH_MARKER}`;

  if (source.includes(marker)) return;
  if (verifyOnly) fail('Compiled icns.js is not patched.');
  if (!vulnerable.test(source)) {
    fail('Expected vulnerable ICNS offset increment was not found. Refusing a blind patch.');
  }

  source = source.replace(vulnerable, `${marker}\n        imageOffset += imageHeader[1];`);
  fs.writeFileSync(file, source);
}

function main() {
  const verifyOnly = process.argv.includes('--verify');
  const root = resolvePackageRoot();
  readPackageVersion(root);
  patchUtils(root, verifyOnly);
  patchIcns(root, verifyOnly);

  if (!verifyOnly) {
    // Re-read through verification mode so a partial write can never be accepted.
    patchUtils(root, true);
    patchIcns(root, true);
    process.stdout.write(`Patched image-size@${EXPECTED_VERSION} for GHSA-w3rx-r6r6-pgpr and GHSA-5p2g-fcmc-qvqq.\n`);
  } else {
    process.stdout.write(`Verified local image-size@${EXPECTED_VERSION} CVE patch.\n`);
  }
}

main();
