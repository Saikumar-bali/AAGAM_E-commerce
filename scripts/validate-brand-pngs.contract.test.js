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

function fullScanlines() {
  return Buffer.alloc(256 * (128 + 1));
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const palette = Buffer.from([0, 0, 0]);

function indexedPng(parts) {
  return Buffer.concat([signature, chunk('IHDR', header()), ...parts, chunk('IEND')]);
}

function incompleteScanlinePng() {
  return indexedPng([chunk('PLTE', palette), chunk('IDAT', deflateSync(Buffer.from([0])))]);
}

function paletteAfterIdatPng() {
  return indexedPng([chunk('IDAT', deflateSync(fullScanlines())), chunk('PLTE', palette)]);
}

function invalidChunkTypePng() {
  return indexedPng([
    chunk('PLTE', palette),
    chunk('1abc'),
    chunk('IDAT', deflateSync(fullScanlines())),
  ]);
}

function invalidReservedBitPng() {
  return indexedPng([
    chunk('PLTE', palette),
    chunk('abca'),
    chunk('IDAT', deflateSync(fullScanlines())),
  ]);
}

function trailingZlibBytesPng() {
  const compressed = Buffer.concat([deflateSync(fullScanlines()), Buffer.from([1, 2, 3])]);
  return indexedPng([chunk('PLTE', palette), chunk('IDAT', compressed)]);
}

function outOfRangePaletteIndexPng() {
  const scanlines = fullScanlines();
  scanlines[1] = 0x10;
  return indexedPng([chunk('PLTE', palette), chunk('IDAT', deflateSync(scanlines))]);
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
  expectRejected(join(tempDir, 'palette-after-idat.png'), paletteAfterIdatPng(), 'indexed PNG requires PLTE before IDAT');
  expectRejected(join(tempDir, 'invalid-chunk-type.png'), invalidChunkTypePng(), 'invalid PNG chunk type');
  expectRejected(join(tempDir, 'invalid-reserved-bit.png'), invalidReservedBitPng(), 'invalid PNG chunk reserved bit');
  expectRejected(join(tempDir, 'trailing-zlib-bytes.png'), trailingZlibBytesPng(), 'trailing bytes after the zlib image stream');
  expectRejected(join(tempDir, 'palette-index-out-of-range.png'), outOfRangePaletteIndexPng(), 'palette index 1 exceeds 0');
  console.log('Rejected malformed CRC-correct PNG structure and pixel streams.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
