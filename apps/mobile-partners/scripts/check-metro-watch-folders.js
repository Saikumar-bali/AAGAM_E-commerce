const path = require('path');

const appRoot = path.resolve(__dirname, '..');
const monorepoRoot = path.resolve(appRoot, '../..');
const expected = [
  path.resolve(monorepoRoot, 'packages/mobile-shared'),
  path.resolve(monorepoRoot, 'packages/types'),
  path.resolve(monorepoRoot, 'packages/utils'),
  path.resolve(monorepoRoot, 'node_modules'),
].map(path.normalize);

const config = require('../metro.config');
const actual = (config.watchFolders || []).map((entry) => path.normalize(path.resolve(entry)));

if (path.normalize(path.resolve(config.projectRoot || '')) !== path.normalize(appRoot)) {
  throw new Error(`Metro projectRoot must remain the Partners app: ${appRoot}`);
}

if (actual.includes(path.normalize(monorepoRoot))) {
  throw new Error('Metro must not watch the complete monorepo root');
}

for (const required of expected) {
  if (!actual.includes(required)) {
    throw new Error(`Metro watchFolders is missing required path: ${required}`);
  }
}

const unexpected = actual.filter((entry) => !expected.includes(entry));
if (unexpected.length > 0) {
  throw new Error(`Metro watchFolders contains unexpected paths: ${unexpected.join(', ')}`);
}

console.log('Metro watch-folder scope is limited to required Partners workspaces.');
