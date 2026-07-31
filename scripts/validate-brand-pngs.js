const { readFileSync } = require('node:fs');
const { inflateSync } = require('node:zlib');

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: node scripts/validate-brand-pngs.js <png> [...]');
  process.exit(2);
}

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const WIDTH = 256;
const HEIGHT = 256;
const BIT_DEPTH = 4;
const COLOR_TYPE = 3;
const PALETTE_ENTRIES = 16;
const PALETTE_BYTES = PALETTE_ENTRIES * 3;
const TRANSPARENCY_BYTES = PALETTE_ENTRIES;
const ROW_BYTES = (WIDTH * BIT_DEPTH) / 8;
const EXPECTED_INFLATED_BYTES = HEIGHT * (ROW_BYTES + 1);
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

function isAsciiLetter(byte) {
  return (byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122);
}

function readChunk(file, png, offset) {
  if (offset + 12 > png.length) throw new Error(`${file}: truncated PNG chunk`);
  const length = png.readUInt32BE(offset);
  const typeBuffer = png.subarray(offset + 4, offset + 8);
  if (!Array.from(typeBuffer).every(isAsciiLetter)) throw new Error(`${file}: invalid PNG chunk type`);
  if (typeBuffer[2] >= 97 && typeBuffer[2] <= 122) {
    throw new Error(`${file}: invalid PNG chunk reserved bit`);
  }

  const type = typeBuffer.toString('ascii');
  const dataStart = offset + 8;
  const dataEnd = dataStart + length;
  const crcOffset = dataEnd;
  if (crcOffset + 4 > png.length) throw new Error(`${file}: truncated ${type} chunk`);

  const expectedCrc = png.readUInt32BE(crcOffset);
  const actualCrc = crc32(png.subarray(offset + 4, dataEnd));
  if (actualCrc !== expectedCrc) throw new Error(`${file}: bad ${type} CRC`);

  return {
    type,
    length,
    data: png.subarray(dataStart, dataEnd),
    nextOffset: crcOffset + 4,
  };
}

function expectChunk(file, chunk, type, length) {
  if (chunk.type !== type) throw new Error(`${file}: expected ${type}, found ${chunk.type}`);
  if (chunk.length !== length) throw new Error(`${file}: invalid ${type} length ${chunk.length}`);
}

for (const file of files) {
  const png = readFileSync(file);
  if (!png.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`${file}: invalid PNG signature`);

  let offset = 8;
  const header = readChunk(file, png, offset);
  expectChunk(file, header, 'IHDR', 13);
  offset = header.nextOffset;

  const width = header.data.readUInt32BE(0);
  const height = header.data.readUInt32BE(4);
  const bitDepth = header.data[8];
  const colorType = header.data[9];
  const compressionMethod = header.data[10];
  const filterMethod = header.data[11];
  const interlaceMethod = header.data[12];
  if (
    width !== WIDTH ||
    height !== HEIGHT ||
    bitDepth !== BIT_DEPTH ||
    colorType !== COLOR_TYPE ||
    compressionMethod !== 0 ||
    filterMethod !== 0 ||
    interlaceMethod !== 0
  ) {
    throw new Error(
      `${file}: expected canonical ${WIDTH}x${HEIGHT} 4-bit indexed non-interlaced PNG`,
    );
  }

  const palette = readChunk(file, png, offset);
  expectChunk(file, palette, 'PLTE', PALETTE_BYTES);
  offset = palette.nextOffset;

  const transparency = readChunk(file, png, offset);
  expectChunk(file, transparency, 'tRNS', TRANSPARENCY_BYTES);
  offset = transparency.nextOffset;

  const idat = [];
  let sawIend = false;
  while (offset < png.length) {
    const chunk = readChunk(file, png, offset);
    offset = chunk.nextOffset;
    if (chunk.type === 'IDAT') {
      idat.push(chunk.data);
      continue;
    }
    if (chunk.type === 'IEND') {
      if (chunk.length !== 0) throw new Error(`${file}: invalid IEND length`);
      if (idat.length === 0) throw new Error(`${file}: missing IDAT`);
      if (offset !== png.length) throw new Error(`${file}: trailing bytes after IEND`);
      sawIend = true;
      break;
    }
    throw new Error(`${file}: expected IDAT or IEND, found ${chunk.type}`);
  }

  if (!sawIend) throw new Error(`${file}: missing IEND`);

  const compressed = Buffer.concat(idat);
  const inflatedResult = inflateSync(compressed, { info: true });
  if (inflatedResult.engine.bytesWritten !== compressed.length) {
    throw new Error(`${file}: trailing bytes after the zlib image stream`);
  }
  const inflated = inflatedResult.buffer;
  if (inflated.length !== EXPECTED_INFLATED_BYTES) {
    throw new Error(
      `${file}: invalid inflated data length ${inflated.length}; expected ${EXPECTED_INFLATED_BYTES}`,
    );
  }
  for (let row = 0; row < HEIGHT; row += 1) {
    const filterType = inflated[row * (ROW_BYTES + 1)];
    if (filterType > 4) throw new Error(`${file}: invalid filter byte ${filterType} on row ${row}`);
  }

  console.log(`Valid canonical Android PNG: ${file} (${WIDTH}x${HEIGHT}, indexed-4)`);
}
