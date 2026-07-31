const { readFileSync } = require('node:fs');
const { inflateSync } = require('node:zlib');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/validate-brand-pngs.js <png> [...]');
  process.exit(2);
}

const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
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
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function isSupportedFormat(bitDepth, colorType) {
  if (colorType === 3) return [1, 2, 4, 8].includes(bitDepth);
  return [2, 6].includes(colorType) && bitDepth === 8;
}

function bytesPerScanline(width, bitDepth, colorType) {
  const channels = { 2: 3, 3: 1, 6: 4 }[colorType];
  return Math.ceil((width * channels * bitDepth) / 8);
}

for (const file of files) {
  const png = readFileSync(file);
  if (!png.subarray(0, 8).equals(signature)) throw new Error(`${file}: invalid PNG signature`);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let compressionMethod = -1;
  let filterMethod = -1;
  let interlaceMethod = -1;
  let paletteEntries = 0;
  let sawHeader = false;
  let sawPalette = false;
  let sawIdat = false;
  let endedIdatSequence = false;
  let sawIend = false;
  const idat = [];

  while (offset < png.length) {
    if (offset + 12 > png.length) throw new Error(`${file}: truncated PNG chunk`);
    const length = png.readUInt32BE(offset);
    const type = png.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const crcOffset = dataEnd;
    if (crcOffset + 4 > png.length) throw new Error(`${file}: truncated ${type} chunk`);

    const expectedCrc = png.readUInt32BE(crcOffset);
    const actualCrc = crc32(png.subarray(offset + 4, dataEnd));
    if (actualCrc !== expectedCrc) throw new Error(`${file}: bad ${type} CRC`);

    const data = png.subarray(dataStart, dataEnd);
    if (type === 'IHDR') {
      if (sawHeader || offset !== 8 || length !== 13) throw new Error(`${file}: invalid IHDR`);
      sawHeader = true;
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
      compressionMethod = data[10];
      filterMethod = data[11];
      interlaceMethod = data[12];
    } else {
      if (!sawHeader) throw new Error(`${file}: ${type} appears before IHDR`);
      if (sawIend) throw new Error(`${file}: chunk appears after IEND`);

      if (type === 'PLTE') {
        if (sawPalette) throw new Error(`${file}: duplicate PLTE`);
        if (sawIdat) throw new Error(`${file}: PLTE must appear before IDAT`);
        if (length === 0 || length % 3 !== 0 || length > 768) throw new Error(`${file}: invalid PLTE`);
        sawPalette = true;
        paletteEntries = length / 3;
      } else if (type === 'IDAT') {
        if (endedIdatSequence) throw new Error(`${file}: IDAT chunks must be consecutive`);
        if (colorType === 3 && !sawPalette) throw new Error(`${file}: indexed PNG requires PLTE before IDAT`);
        sawIdat = true;
        idat.push(data);
      } else if (type === 'IEND') {
        if (length !== 0) throw new Error(`${file}: invalid IEND`);
        sawIend = true;
        if (crcOffset + 4 !== png.length) throw new Error(`${file}: trailing bytes after IEND`);
      } else {
        if (sawIdat) endedIdatSequence = true;
        const isCritical = type.charCodeAt(0) >= 65 && type.charCodeAt(0) <= 90;
        if (isCritical) throw new Error(`${file}: unsupported critical chunk ${type}`);
      }
    }
    offset = crcOffset + 4;
  }

  if (!sawHeader) throw new Error(`${file}: missing IHDR`);
  if (!sawIend) throw new Error(`${file}: missing IEND`);
  if (!sawIdat || idat.length === 0) throw new Error(`${file}: missing IDAT`);
  if (width !== 256 || height !== 256) throw new Error(`${file}: expected 256x256, got ${width}x${height}`);
  if (!isSupportedFormat(bitDepth, colorType)) {
    throw new Error(`${file}: unsupported PNG format bitDepth=${bitDepth} colorType=${colorType}`);
  }
  if (compressionMethod !== 0 || filterMethod !== 0 || interlaceMethod !== 0) {
    throw new Error(`${file}: unsupported PNG compression/filter/interlace method`);
  }
  if (colorType === 3) {
    if (!sawPalette) throw new Error(`${file}: indexed PNG is missing a valid palette`);
    if (paletteEntries > 2 ** bitDepth) throw new Error(`${file}: palette has too many entries for bit depth ${bitDepth}`);
  }

  const rowBytes = bytesPerScanline(width, bitDepth, colorType);
  const inflated = inflateSync(Buffer.concat(idat));
  const expectedInflatedLength = height * (rowBytes + 1);
  if (inflated.length !== expectedInflatedLength) {
    throw new Error(`${file}: invalid inflated data length ${inflated.length}; expected ${expectedInflatedLength}`);
  }
  for (let row = 0; row < height; row += 1) {
    const filterType = inflated[row * (rowBytes + 1)];
    if (filterType > 4) throw new Error(`${file}: invalid filter byte ${filterType} on row ${row}`);
  }

  console.log(`Valid Android PNG: ${file} (${width}x${height}, bitDepth=${bitDepth}, colorType=${colorType})`);
}
