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
  for (let bit = 0; bit < 8; bit += 1) crc = (crc & 1) !== 0 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
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

function header() {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(256, 0);
  data.writeUInt32BE(256, 4);
  data[8] = 4;
  data[9] = 3;
  return data;
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const palette = Buffer.from([0, 0, 0]);

function incompleteScanlinePng() {
  return Buffer.concat([
    signature,
    chunk('IHDR', header()),
    chunk('PLTE', palette),
    chunk('IDAT', deflateSync(Buffer.from([0]))),
    chunk('IEND'),
  ]);
}

function paletteAfterIdatPng() {
  const fullScanlines = Buffer.alloc(256 * (128 + 1));
  return Buffer.concat([
    signature,
    chunk('IHDR', header()),
    chunk('IDAT', deflateSync(fullScanlines)),
    chunk('PLTE', palette),
    chunk('IEND'),
  ]);
}

function expectRejected(file, bytes, expectedMessage) {
  writeFileSync(file, bytes);
  const result = spawnSync(process.execPath, [validator, file], { encoding: 'utf8' });
  if (result.status === 0 || !result.stderr.includes(expectedMessage)) {
    process.stderr.write(`Validator accepted invalid PNG ${file}.\n${result.stderr}${result.stdout}`);
    process.exit(1);
  }
}

const validResult = spawnSync(process.execPath, [validator, ...files], { cwd: root, encoding: 'utf8' });
if (validResult.status !== 0) {
  process.stderr.write(validResult.stderr || validResult.stdout);
  process.exit(validResult.status ?? 1);
}
process.stdout.write(validResult.stdout);

const tempDir = mkdtempSync(join(tmpdir(), 'aagam-png-contract-'));
try {
  expectRejected(join(tempDir, 'truncated-scanlines.png'), incompleteScanlinePng(), 'invalid inflated data length');
  console.log('Rejected CRC-correct PNG with incomplete scanlines.');

  expectRejected(join(tempDir, 'palette-after-idat.png'), paletteAfterIdatPng(), 'indexed PNG requires PLTE before IDAT');
  console.log('Rejected indexed PNG with PLTE after IDAT.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
