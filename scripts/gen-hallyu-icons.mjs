#!/usr/bin/env node
/**
 * Generates the Hallyu TV icon set programmatically (no image deps):
 * a stylized glowing coral wave crest on an obsidian background — the
 * "Hallyu (Korean) wave". Outputs icon.png, adaptive-icon.png (with mask-safe
 * padding), splash-icon.png (transparent) and favicon.png.
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(root, "assets", "images");

// ---------- PNG encoder ----------
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
function encodePng(size, rgba) {
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------- Hallyu wave renderer ----------
const BG = [8, 10, 13]; // #080A0D obsidian
const CORAL = [255, 144, 112]; // #FF9070 crest
const EMBER = [240, 120, 85]; // #F07855 body
const DEEP = [101, 56, 47]; // #65382F underside

/** Signed distance (in y) to the wave centre-line, plus wave height at x. */
function wave(x, size, amp, phase) {
  const cx = x / size;
  return size / 2 + amp * Math.sin(cx * Math.PI * 2 + phase) * Math.sin(cx * Math.PI); // fades at edges
}

function render(size, { padding = 0, transparentBg = false } = {}) {
  const rgba = Buffer.alloc(size * size * 4);
  const inner = size - padding * 2;
  const amp = inner * 0.16;
  const thickness = inner * 0.085;
  const glowR = inner * 0.34;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x - padding;
      const py = y - padding;
      const cx = px / inner;
      const wy = wave(px, inner, amp, -Math.PI / 2);
      const d = py - wy; // + below the wave

      // Foam sparkles along the crest (deterministic pseudo-random).
      let sparkle = 0;
      if (d < -thickness * 0.4 && d > -thickness * 2.2) {
        const seed = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
        const frac = seed - Math.floor(seed);
        if (frac > 0.995) sparkle = (frac - 0.995) / 0.005;
      }

      let r, g, b, a;
      if (Math.abs(d) <= thickness) {
        // Inside the ribbon: vertical gradient coral → ember → deep.
        const t = (d + thickness) / (thickness * 2);
        const c = t < 0.35
          ? mix(CORAL, EMBER, t / 0.35)
          : mix(EMBER, DEEP, (t - 0.35) / 0.65);
        [r, g, b] = c;
        a = 255;
        // Highlight at the very top edge of the ribbon.
        if (d < -thickness * 0.55) [r, g, b] = mix(CORAL, [255, 210, 190], 0.5);
      } else {
        // Soft glow falloff outside the ribbon.
        const dist = Math.abs(d) - thickness;
        const glow = Math.max(0, 1 - dist / glowR) ** 2.6 * 0.55;
        const spark = sparkle * Math.max(0, 1 - dist / (glowR * 0.5)) * 0.9;
        [r, g, b] = mix(BG, CORAL, glow + spark);
        a = transparentBg ? Math.round(Math.min(1, glow + spark) * 255) : 255;
        if (transparentBg) [r, g, b] = mix(CORAL, [255, 230, 220], 0.2);
      }

      const o = (y * size + x) * 4;
      rgba[o] = Math.min(255, Math.round(r));
      rgba[o + 1] = Math.min(255, Math.round(g));
      rgba[o + 2] = Math.min(255, Math.round(b));
      rgba[o + 3] = a;
    }
  }
  return encodePng(size, rgba);
}

function mix(a, b, t) {
  const c = Math.min(1, Math.max(0, t));
  return [a[0] + (b[0] - a[0]) * c, a[1] + (b[1] - a[1]) * c, a[2] + (b[2] - a[2]) * c];
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "icon.png"), render(1024, { padding: 0 }));
writeFileSync(join(outDir, "favicon.png"), render(1024, { padding: 0 }));
// Adaptive foreground: keep the mark inside the 66% safe zone for circular masks.
writeFileSync(join(outDir, "adaptive-icon.png"), render(1024, { padding: 190 }));
// Splash: transparent background, mark only.
writeFileSync(join(outDir, "splash-icon.png"), render(1024, { padding: 170, transparentBg: true }));
console.log("wrote Hallyu TV icon set");
