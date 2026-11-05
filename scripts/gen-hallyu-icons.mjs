#!/usr/bin/env node
/**
 * Generates the Hallyu icon & Android TV Leanback banner set programmatically
 * (zero native image deps): a glowing coral-pearl Liquid Glass wave crest on a
 * deep cinema obsidian background (#05080E). Outputs icon.png, adaptive-icon.png,
 * splash-icon.png, favicon.png, and tv-banner.png (320x180 xhdpi TV banner).
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets", "images");

function crc32(buf) {
  const table = [];
  for (let n = 0; n < 256; n++) {
    let c = n;
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

function encodePngRect(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const BG = [5, 8, 14]; // #05080E obsidian
const PEARL = [255, 244, 236]; // #FFF4EC liquid glass rim
const CORAL = [255, 132, 98]; // #FF8462 crest
const EMBER = [255, 98, 66]; // #FF6242 core
const DEEP = [96, 42, 34]; // warm shadow

function mix(a, b, t) {
  const c = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * c, a[1] + (b[1] - a[1]) * c, a[2] + (b[2] - a[2]) * c];
}

function wave(x, width, height, amp, phase) {
  const cx = Math.min(1, Math.max(0, x / width));
  return height / 2 + amp * Math.sin(cx * Math.PI * 2 + phase) * Math.sin(cx * Math.PI);
}

function renderSquare(size, { padding = 0, transparentBg = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const inner = size - padding * 2;
  const amp = inner * 0.16;
  const thickness = inner * 0.085;
  const glowR = inner * 0.34;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x - padding;
      const py = y - padding;
      const wy = wave(px, inner, inner, amp, -Math.PI / 2);
      const d = py - wy;

      let sparkle = 0;
      if (d < -thickness * 0.4 && d > -thickness * 2.2) {
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const frac = seed - Math.floor(seed);
        if (frac > 0.995) sparkle = (frac - 0.995) / 0.005;
      }

      let r, g, b, a;
      if (px >= 0 && px <= inner && Math.abs(d) <= thickness) {
        const t = (d + thickness) / (thickness * 2);
        const c = t < 0.35 ? mix(CORAL, EMBER, t / 0.35) : mix(EMBER, DEEP, (t - 0.35) / 0.65);
        [r, g, b] = c;
        a = 255;
        if (d < -thickness * 0.58) [r, g, b] = mix(CORAL, PEARL, 0.68);
      } else {
        const dist = Math.abs(d) - thickness;
        const glow = px >= -padding * 0.5 && px <= inner + padding * 0.5 ? Math.max(0, 1 - dist / glowR) ** 2.6 * 0.55 : 0;
        const spark = sparkle * Math.max(0, 1 - dist / (glowR * 0.5)) * 0.9;
        [r, g, b] = mix(BG, CORAL, glow + spark);
        a = transparentBg ? Math.round(Math.min(1, glow + spark) * 255) : 255;
        if (transparentBg) [r, g, b] = mix(CORAL, PEARL, 0.25);
      }

      const o = (y * size + x) * 4;
      rgba[o] = Math.min(255, Math.round(r));
      rgba[o + 1] = Math.min(255, Math.round(g));
      rgba[o + 2] = Math.min(255, Math.round(b));
      rgba[o + 3] = a;
    }
  }
  return encodePngRect(size, size, rgba);
}

/** 320x180 Android TV Leanback banner with Liquid Glass capsule frame + wave crest. */
function renderTvBanner(width = 320, height = 180) {
  const rgba = Buffer.alloc(width * height * 4);
  const amp = height * 0.2;
  const thickness = height * 0.095;
  const glowR = height * 0.42;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const wy = wave(x - 24, width - 48, height, amp, -Math.PI / 2);
      const d = y - wy;
      const inWaveX = x >= 24 && x <= width - 24;

      // Subtle diagonal Liquid Glass ambient sheen across the banner
      const sheen = Math.max(0, 1 - Math.abs((x / width) * 0.7 + (y / height) * 0.5 - 0.45) * 2.4) * 0.08;
      let [r, g, b] = mix(BG, [28, 38, 56], sheen * 4);

      if (inWaveX && Math.abs(d) <= thickness) {
        const t = (d + thickness) / (thickness * 2);
        [r, g, b] = t < 0.35 ? mix(CORAL, EMBER, t / 0.35) : mix(EMBER, DEEP, (t - 0.35) / 0.65);
        if (d < -thickness * 0.55) [r, g, b] = mix(CORAL, PEARL, 0.72);
      } else if (inWaveX) {
        const dist = Math.abs(d) - thickness;
        const glow = Math.max(0, 1 - dist / glowR) ** 2.4 * 0.5;
        [r, g, b] = mix([r, g, b], CORAL, glow);
      }

      // 1px specular Liquid Glass inner border highlight
      if (x === 1 || y === 1 || x === width - 2 || y === height - 2) {
        const topBias = 1 - (x / width) * 0.5 - (y / height) * 0.5;
        [r, g, b] = mix([r, g, b], PEARL, 0.12 + Math.max(0, topBias) * 0.24);
      }

      const o = (y * width + x) * 4;
      rgba[o] = Math.min(255, Math.round(r));
      rgba[o + 1] = Math.min(255, Math.round(g));
      rgba[o + 2] = Math.min(255, Math.round(b));
      rgba[o + 3] = 255;
    }
  }
  return encodePngRect(width, height, rgba);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon.png"), renderSquare(1024, { padding: 0 }));
writeFileSync(join(outDir, "favicon.png"), renderSquare(1024, { padding: 0 }));
writeFileSync(join(outDir, "adaptive-icon.png"), renderSquare(1024, { padding: 190 }));
writeFileSync(join(outDir, "splash-icon.png"), renderSquare(1024, { padding: 170, transparentBg: true }));
writeFileSync(join(outDir, "tv-banner.png"), renderTvBanner(320, 180));
console.log("wrote Hallyu Liquid Glass icon + TV banner set");
