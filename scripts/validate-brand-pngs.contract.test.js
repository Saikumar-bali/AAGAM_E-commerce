const { mkdtempSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { deflateSync } = require('node:zlib');

const root = resolve(__dirname, '..');
const validator = resolve(__dirname, 'validate-brand-pngs.js');
const files = [
  'apps/admin-dashboard/public/brand/aagam-mark.png',
  'apps/admin-dashboard/src/app/icon.png',
  'apps/mobile-customer/src/assets/aagam-mark.png',
  'apps/mobile-customer/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png',
  'apps/mobile-partners/src/assets/aagam-mark.png',
  'apps/mobile-partners/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png',
];

const crcTable = new Uint32Array(256);
for (let value = 0; value < crcTable.length; value += 1) {
  let crc = value;
  for (let bit = 0; bit < 8; bit += 1) {
    crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
  }
  crcTable[value] = crc >>> 0;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function truncatedIndexedPng() {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const header = Buffer.alloc(13);
  header.writeUInt32BE(256, 0);
  header.writeUInt32BE(256, 4);
  header[8] = 4;
  header[9] = 3;
  const palette = Buffer.from([0, 0, 0]);
  return Buffer.concat([
    signature,
    chunk('IHDR', header),
    chunk('PLTE', palette),
    chunk('IDAT', deflateSync(Buffer.from([0]))),
    chunk('IEND'),
  ]);
}

const result = spawnSync(process.execPath, [validator, ...files], {
  cwd: root,
  encoding: 'utf8',
});
if (result.status !== 0) {
  process.stderr.write(result.stderr || result.stdout);
  process.exit(result.status ?? 1);
}
process.stdout.write(result.stdout);

const tempDir = mkdtempSync(join(tmpdir(), 'aagam-png-contract-'));
try {
  const invalidFile = join(tempDir, 'truncated-scanlines.png');
  writeFileSync(invalidFile, truncatedIndexedPng());
  const invalidResult = spawnSync(process.execPath, [validator, invalidFile], { encoding: 'utf8' });
  if (invalidResult.status === 0 || !invalidResult.stderr.includes('invalid inflated data length')) {
    process.stderr.write(`Validator accepted an incomplete scanline stream.\n${invalidResult.stderr}${invalidResult.stdout}`);
    process.exit(1);
  }
  console.log('Rejected CRC-correct PNG with incomplete scanlines.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
