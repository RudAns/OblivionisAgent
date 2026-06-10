// 生成合法占位图标：icon.png(256) + icon.ico(PNG 封装) + 几个尺寸 PNG，供 Tauri 编译/打包。
// 之后可用真实 logo 替换：pnpm --filter @oblivionis/desktop tauri icon path/to/logo.png
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

// CRC32（PNG 用）
const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = crcTable[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function makePng(size) {
  const raw = Buffer.alloc(size * (1 + size * 4));
  const cx = size / 2,
    cy = size / 2;
  const rOut = size * 0.39,
    rIn = size * 0.25;
  for (let y = 0; y < size; y++) {
    const rowStart = y * (1 + size * 4);
    raw[rowStart] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const o = rowStart + 1 + x * 4;
      const d = Math.hypot(x - cx, y - cy);
      const ring = d < rOut && d > rIn;
      if (ring) {
        raw[o] = 79;
        raw[o + 1] = 140;
        raw[o + 2] = 255;
        raw[o + 3] = 255;
      } else {
        raw[o] = 20;
        raw[o + 1] = 22;
        raw[o + 2] = 26;
        raw[o + 3] = 255;
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// 把 256 的 PNG 封装成 ICO（Vista+ 支持 PNG 编码的 ICO 条目）
function pngToIco(png, size) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(1, 4); // count
  const entry = Buffer.alloc(16);
  entry[0] = size >= 256 ? 0 : size; // width (0 = 256)
  entry[1] = size >= 256 ? 0 : size; // height
  entry[2] = 0; // palette
  entry[3] = 0; // reserved
  entry.writeUInt16LE(1, 4); // planes
  entry.writeUInt16LE(32, 6); // bpp
  entry.writeUInt32LE(png.length, 8); // size
  entry.writeUInt32LE(6 + 16, 12); // offset
  return Buffer.concat([header, entry, png]);
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const iconDir = resolve(__dirname, "../apps/desktop/src-tauri/icons");
mkdirSync(iconDir, { recursive: true });

const png256 = makePng(256);
writeFileSync(join(iconDir, "icon.png"), png256);
writeFileSync(join(iconDir, "128x128.png"), makePng(128));
writeFileSync(join(iconDir, "32x32.png"), makePng(32));
writeFileSync(join(iconDir, "128x128@2x.png"), makePng(256));
writeFileSync(join(iconDir, "icon.ico"), pngToIco(png256, 256));
console.log("wrote icons to", iconDir);
