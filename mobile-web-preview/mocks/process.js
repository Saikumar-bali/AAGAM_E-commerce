/* Minimal browser `process` shim (the app only needs env, browser, nextTick). */
const processShim = {
  env: { NODE_ENV: process.env.NODE_ENV },
  browser: true,
  version: '',
  versions: {},
  platform: 'browser',
  nextTick: (fn, ...args) => setTimeout(() => fn(...args), 0),
  cwd: () => '/',
  on: () => undefined,
  once: () => undefined,
  off: () => undefined,
  emit: () => undefined,
  removeListener: () => undefined,
};

module.exports = processShim;
module.exports.default = processShim;
