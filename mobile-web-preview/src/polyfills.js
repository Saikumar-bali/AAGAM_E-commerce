/* Browser polyfills needed by React Native app code running under webpack.
 * `process.env` is provided by DefinePlugin; this only fills the rest.
 */
import process from 'process';

if (typeof window !== 'undefined') {
  window.process = window.process || process;
  window.global = window.global || window;
}

if (typeof globalThis.process === 'undefined') {
  globalThis.process = process;
}
