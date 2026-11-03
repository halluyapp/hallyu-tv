#!/usr/bin/env node
/**
 * Generates placeholder brand assets (solid ember-on-obsidian PNGs) so
 * `expo prebuild` has the files app.json references. Replace with designed
 * icons when available — keep the same paths.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets", "images");

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const byte of buf) crc = table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])));
  return Buffer.concat([len, typeBuf, data, crc]);
}

/** Radial ember glow: bright core, warm falloff, obsidian background. */
function emberPng(size) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  const cx = size / 2;
  const cy = size / 2;
  const maxR = size / 2;
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - cx, y - cy) / maxR;
      const core = Math.max(0, 1 - d * 2.2); // bright inner ember
      const glow = Math.max(0, 1 - d) ** 3 * 0.55; // soft outer glow
      const r = Math.round(8 + core * 240 + glow * 232);
      const g = Math.round(10 + core * 110 + glow * 110);
      const b = Math.round(13 + core * 70 + glow * 80);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = Math.min(255, r);
      raw[o + 1] = Math.min(255, g);
      raw[o + 2] = Math.min(255, b);
      raw[o + 3] = 255;
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

mkdirSync(outDir, { recursive: true });
for (const name of ["icon.png", "adaptive-icon.png", "splash-icon.png", "favicon.png"]) {
  writeFileSync(join(outDir, name), emberPng(1024));
  console.log("wrote", name);
}
