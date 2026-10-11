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

// React Native's fetch/FormData accept `{ uri, name, type }` file parts; the
// browser's FormData does not, so an evidence/document upload would post an
// empty body. The picker shim parks the real File under its object URL; swap it
// back in synchronously so the multipart body is complete before fetch sends.
if (typeof window !== 'undefined' && typeof window.FormData === 'function') {
  const NativeFormData = window.FormData;
  const isFilePart = (v) => v && typeof v === 'object' && typeof v.uri === 'string' && (v.name || v.type);

  window.FormData = class FormData extends NativeFormData {
    append(name, value, filename) {
      if (isFilePart(value)) {
        const file = (window.__AAGAM_FILES__ || {})[value.uri];
        if (file) return super.append(name, file, filename || value.name || file.name);
      }
      return super.append(name, value, filename);
    }
  };
}

