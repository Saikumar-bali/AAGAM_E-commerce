#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { createRequire } = require('module');

const EXPECTED_UUID_VERSION = '11.1.1';

function packageRequire(packageName) {
  // Resolve the package's entry point, not its package.json: several
  // transitive dependencies (e.g. gaxios 7.x) ship a restrictive "exports"
  // map that does not expose "./package.json", so resolving the manifest
  // throws ERR_PACKAGE_PATH_NOT_EXPORTED. Scoping a require to the entry file
  // still resolves nested dependencies from the package's own directory.
  const entry = require.resolve(packageName, { paths: [process.cwd()] });
  return createRequire(entry);
}

function verifyUuidFor(packageName) {
  const req = packageRequire(packageName);
  const uuidPackageJson = req.resolve('uuid/package.json');
  const uuidPackage = req(uuidPackageJson);
  assert.strictEqual(
    uuidPackage.version,
    EXPECTED_UUID_VERSION,
    `${packageName} must resolve uuid@${EXPECTED_UUID_VERSION}, found ${uuidPackage.version}`,
  );

  const uuid = req('uuid');
  assert.strictEqual(typeof uuid.v4, 'function', `${packageName} must retain uuid.v4 API compatibility`);
  const generated = uuid.v4();
  assert.strictEqual(uuid.validate(generated), true, `${packageName} override must generate a valid UUID`);
  assert.strictEqual(uuid.version(generated), 4, `${packageName} override must generate UUID v4`);

  console.log(`${packageName} resolves compatible uuid@${uuidPackage.version}`);
}

verifyUuidFor('gaxios');
verifyUuidFor('teeny-request');
