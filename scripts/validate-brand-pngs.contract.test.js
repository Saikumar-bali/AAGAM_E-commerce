const { mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join, resolve } = require('node:path');
const { spawnSync } = require('node:child_process');
const { deflateSync } = require('node:zlib');

const root = resolve(__dirname, '..');
const validator = resolve(__dirname, 'validate-brand-pngs.js');
const files = [
  'apps/mobile-customer/src/assets/aagam-mark.png',
  'apps/mobile-customer/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png',
  'apps/mobile-partners/src/assets/aagam-mark.png',
  'apps/mobile-partners/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png',
];

const webBrandRoute = readFileSync(
  resolve(root, 'apps/admin-dashboard/src/app/brand/aagam-mark/route.ts'),
  'utf8',
);
const webLayout = readFileSync(resolve(root, 'apps/admin-dashboard/src/app/layout.tsx'), 'utf8');
const webLogo = readFileSync(resolve(root, 'apps/admin-dashboard/src/components/AagamLogo.tsx'), 'utf8');
const customerShell = readFileSync(
  resolve(root, 'apps/admin-dashboard/src/components/customer/CustomerShell.tsx'),
  'utf8',
);

if (!webBrandRoute.includes('../mobile-customer/android/app/src/main/res/drawable-nodpi/aagam_launcher_logo.png')) {
  throw new Error('Web brand route must serve the authoritative customer Android launcher logo.');
}
for (const [name, source] of [
  ['root metadata', webLayout],
  ['shared web logo', webLogo],
  ['customer web shell', customerShell],
]) {
  if (!source.includes('/brand/aagam-mark')) {
    throw new Error(`${name} must use the shared Android-backed web brand route.`);
  }
}

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

function header({ bitDepth = 4, colorType = 3 } = {}) {
  const data = Buffer.alloc(13);
  data.writeUInt32BE(256, 0);
  data.writeUInt32BE(256, 4);
  data[8] = bitDepth;
  data[9] = colorType;
  return data;
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const palette = Buffer.alloc(48);
const transparency = Buffer.alloc(16, 255);
const indexedScanlines = () => Buffer.alloc(256 * 129);

function png(parts, options) {
  return Buffer.concat([signature, chunk('IHDR', header(options)), ...parts, chunk('IEND')]);
}

function canonicalParts(compressed = deflateSync(indexedScanlines())) {
  return [chunk('PLTE', palette), chunk('tRNS', transparency), chunk('IDAT', compressed)];
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
  expectRejected(
    join(tempDir, 'truncated-scanlines.png'),
    png(canonicalParts(deflateSync(Buffer.from([0])))),
    'invalid inflated data length',
  );
  expectRejected(
    join(tempDir, 'palette-after-idat.png'),
    png([chunk('IDAT', deflateSync(indexedScanlines())), chunk('PLTE', palette), chunk('tRNS', transparency)]),
    'expected PLTE, found IDAT',
  );
  expectRejected(
    join(tempDir, 'invalid-chunk-type.png'),
    png([chunk('PLTE', palette), chunk('1abc'), chunk('tRNS', transparency), chunk('IDAT', deflateSync(indexedScanlines()))]),
    'invalid PNG chunk type',
  );
  expectRejected(
    join(tempDir, 'invalid-reserved-bit.png'),
    png([chunk('PLTE', palette), chunk('abca'), chunk('tRNS', transparency), chunk('IDAT', deflateSync(indexedScanlines()))]),
    'invalid PNG chunk reserved bit',
  );
  expectRejected(
    join(tempDir, 'trailing-zlib-bytes.png'),
    png(canonicalParts(Buffer.concat([deflateSync(indexedScanlines()), Buffer.from([1, 2, 3])])),
    'trailing bytes after the zlib image stream',
  );
  expectRejected(
    join(tempDir, 'truecolor-format.png'),
    png([
      chunk('tRNS', Buffer.alloc(6)),
      chunk('PLTE', palette),
      chunk('IDAT', deflateSync(Buffer.alloc(256 * (256 * 3 + 1)))),
    ], { bitDepth: 8, colorType: 2 }),
    'expected canonical 256x256 4-bit indexed non-interlaced PNG',
  );
  expectRejected(
    join(tempDir, 'missing-transparency.png'),
    png([chunk('PLTE', palette), chunk('IDAT', deflateSync(indexedScanlines()))]),
    'expected tRNS, found IDAT',
  );
  console.log('Rejected non-canonical and structurally malformed brand PNGs.');
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
