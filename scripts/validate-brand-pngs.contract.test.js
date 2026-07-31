const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');

const root = resolve(__dirname, '..');
const files = [
  'apps/admin-dashboard/public/brand/aagam-mark.png',
  'apps/admin-dashboard/src/app/icon.png',
  'apps/mobile-customer/src/assets/aagam-mark.png',
  'apps/mobile-customer/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png',
  'apps/mobile-partners/src/assets/aagam-mark.png',
  'apps/mobile-partners/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png',
];

const result = spawnSync(process.execPath, [resolve(__dirname, 'validate-brand-pngs.js'), ...files], {
  cwd: root,
  encoding: 'utf8',
});

if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}

process.stdout.write(result.stdout);
