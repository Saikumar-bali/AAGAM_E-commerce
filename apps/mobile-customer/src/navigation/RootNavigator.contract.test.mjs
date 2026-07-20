import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const source = readFileSync(path.join(here, 'RootNavigator.tsx'), 'utf8');

test('customer navigator does not unmount authentication screens for request loading', () => {
  assert.match(source, /useAuthStore\(\(state\) => state\.user\)/);
  assert.match(source, /useAuthStore\(\(state\) => state\.initialize\)/);
  assert.doesNotMatch(source, /\bisLoading\b/);
  assert.doesNotMatch(source, /const\s*\{[^}]*isLoading[^}]*\}\s*=\s*useAuthStore\(\)/s);
});

test('customer navigator gates only on one-time secure-session initialization', () => {
  assert.match(source, /const \[isInitializing, setIsInitializing\] = useState\(true\)/);
  assert.match(source, /initialize\(\)\.finally\(\(\) =>/);
  assert.match(source, /if \(mounted\) setIsInitializing\(false\)/);
  assert.match(source, /if \(isInitializing\)/);
});
