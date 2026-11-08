/**
 * Helpers for hand-crafting PNG files and test images. These intentionally do not use any code
 * from `src/`, so generated fixtures are independent of the implementation under test, and only
 * use Node APIs so they can be run directly by Node (see `scripts/`).
 */
import { crc32, deflateSync } from "node:zlib";

export const PNG_SIGNATURE: Uint8Array = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

export function chunk(
  type: string,
  data: Uint8Array = new Uint8Array(),
): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

export function ihdr(
  width: number,
  height: number,
  bitDepth: number,
  colorType: number,
  interlace = 0,
): Uint8Array {
  const data = new Uint8Array(13);
  const view = new DataView(data.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  data[8] = bitDepth;
  data[9] = colorType;
  data[10] = 0; // compression method
  data[11] = 0; // filter method
  data[12] = interlace;
  return chunk("IHDR", data);
}

export function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.length;
  }
  return out;
}

export function latin1(text: string): Uint8Array {
  return Uint8Array.from(text, (c) => c.charCodeAt(0));
}

export function zlib(data: Uint8Array): Uint8Array {
  return new Uint8Array(deflateSync(data));
}

/** Split `data` into slices of at most `size` bytes. */
export function split(data: Uint8Array, size: number): Uint8Array[] {
  const out: Uint8Array[] = [];
  for (let i = 0; i < data.length; i += size) {
    out.push(data.subarray(i, i + size));
  }
  return out;
}

/** Deterministic pseudo-random bytes so fixtures are reproducible. */
export function seededBytes(length: number, seed: number): Uint8Array {
  const out = new Uint8Array(length);
  let s = seed >>> 0 || 1;
  for (let i = 0; i < length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    out[i] = s & 0xff;
  }
  return out;
}
