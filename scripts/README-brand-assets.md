# Aagam brand PNG integrity

Run `node scripts/validate-brand-pngs.js` against the committed web, React Native, and Android launcher PNGs before release builds. The validator checks PNG signatures, chunk boundaries, CRC values, dimensions, supported color formats, complete IDAT decompression, IEND termination, and trailing bytes.

This prevents malformed or truncated branding assets from reaching Android AAPT2 during release APK builds.
