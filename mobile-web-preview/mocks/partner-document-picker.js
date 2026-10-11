/* Web shim for apps/mobile-partners/src/native/PartnerDocumentPicker.
 *
 * The real module talks to an Android-only native module (via NativeModules)
 * and throws "Document selection is unavailable in this build" on any other
 * platform. The web preview needs the delivery-proof flow to work, so this shim
 * backs captureImage/pickDocument with a real <input type=file> and resolves the
 * same { uri, name, type, size, source } shape the APK returns.
 */
function pickViaFileInput(source) {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = source === 'CAMERA' ? 'image/*' : 'image/*,application/pdf';
    input.style.position = 'fixed';
    input.style.left = '-9999px';
    input.onchange = () => {
      const file = input.files && input.files[0];
      input.remove();
      if (!file) return reject(new Error('No file selected'));
      const uri = URL.createObjectURL(file);
      // Park the real File so the FormData polyfill can append it synchronously.
      window.__AAGAM_FILES__ = window.__AAGAM_FILES__ || {};
      window.__AAGAM_FILES__[uri] = file;
      resolve({
        uri,
        name: file.name || (source === 'CAMERA' ? 'delivery-proof.png' : 'document.pdf'),
        type: file.type || 'image/png',
        size: file.size,
        source,
      });
    };
    document.body.appendChild(input);
    input.click();
  });
}

export const PartnerDocumentPicker = {
  pickDocument: () => pickViaFileInput('DOCUMENT'),
  captureImage: () => pickViaFileInput('CAMERA'),
  deleteCapturedImage: async () => true,
};
