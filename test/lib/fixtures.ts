/**
 * Fixture file handling shared by the decoder and encoder tests.
 *
 * Expected results are produced by the code under test and committed. Run
 * `npm run fixtures:update` to regenerate them after an intentional behavior change, then review
 * the diff.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { expect } from "vitest";
import type {
  IDecodedPng,
  IEncodePngOptions,
  IImage32,
  IImage64,
} from "../../src/index";
import { parse, stringify } from "./json";

export const FIXTURES_DIR: string = join(import.meta.dirname, "..", "fixtures");
export const DECODE_DIR: string = join(FIXTURES_DIR, "decode");
export const ENCODE_DIR: string = join(FIXTURES_DIR, "encode");

/** When set, tests write expected results instead of comparing against them. */
export const UPDATE: boolean = process.env["UPDATE_FIXTURES"] === "1";

export type Image = IImage32 | IImage64;

// --- file helpers ----------------------------------------------------------------------------

/** Lists files with `extension` in `dir` and its direct subdirectories, relative to `dir`. */
export function listFiles(dir: string, extension: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      for (const f of readdirSync(join(dir, entry.name))) {
        if (f.endsWith(extension)) out.push(join(entry.name, f));
      }
    } else if (entry.name.endsWith(extension)) {
      out.push(entry.name);
    }
  }
  return out.sort();
}

export function readBytes(path: string): Uint8Array {
  return new Uint8Array(readFileSync(path));
}

export function readFixture<T>(path: string): T {
  if (!existsSync(path)) {
    throw new Error(
      `Missing expected result ${path}, run "npm run fixtures:update" to create it`,
    );
  }
  return parse(readFileSync(path, "utf8")) as T;
}

export function writeFixture(path: string, value: unknown): void {
  writeFileSync(path, stringify(value));
}

// --- normalized results ----------------------------------------------------------------------

export interface ErrorInfo {
  type: string;
  message: string;
  offset?: number;
}

export function normalizeError(e: unknown): ErrorInfo {
  if (!(e instanceof Error)) {
    return { type: typeof e, message: String(e) };
  }
  return {
    type: e.constructor.name,
    // The details of inflate errors come from the platform's zlib and differ between runtimes
    message: e.message.replace(
      /(Inflate error while decompressing [a-z ]+): .*$/s,
      "$1: <zlib error>",
    ),
    offset: (e as Error & { offset?: number }).offset,
  };
}

export interface DecodedInfo {
  image: Image;
  details: unknown;
  palette?: number[][];
  metadata: unknown[];
  rawChunks: unknown[];
  warnings: ErrorInfo[];
  info: string[];
}

export type DecodeOutcome = { result: DecodedInfo } | { error: ErrorInfo };

export function normalizeDecoded(r: IDecodedPng<Image>): DecodedInfo {
  const palette = r.palette;
  return {
    image: {
      width: r.image.width,
      height: r.image.height,
      data: r.image.data,
    } as Image,
    details: r.details,
    palette: palette
      ? Array.from({ length: palette.size }, (_, i) =>
          Array.from(palette.getRgb(i)),
        )
      : undefined,
    metadata: r.metadata,
    rawChunks: r.rawChunks,
    warnings: r.warnings.map(normalizeError),
    info: r.info,
  };
}

export async function decodeOutcome(
  fn: () => Promise<IDecodedPng<Image>>,
): Promise<DecodeOutcome> {
  try {
    return { result: normalizeDecoded(await fn()) };
  } catch (e) {
    return { error: normalizeError(e) };
  }
}

/**
 * Expected results of decoding a png fixture, stored as `<name>.json` next to `<name>.png`. All
 * chunk types are parsed (`parseChunkTypes: "*"`).
 */
export interface DecodeFixture {
  expected: DecodeOutcome;
  /** With `strictMode: true`. "same" when identical to `expected`. */
  strict: "same" | DecodeOutcome;
  /** With `force32: true`, only the image differs. "same" when identical to `expected`. */
  force32: "same" | { image: Image };
}

/**
 * An encoder fixture `<name>.json`. `image` and `options` are the input, the rest is the expected
 * result. Unless an error is expected, the expected png is stored as `<name>.png`.
 */
export interface EncodeFixture {
  description: string;
  image: Image;
  options: IEncodePngOptions;
  /** A bug that makes the png not decode back to `image`; the round-trip test is `it.fails`. */
  knownBug?: string;
  expected?: { warnings: ErrorInfo[]; info: string[] } | { error: ErrorInfo };
}

// --- comparisons -----------------------------------------------------------------------------

/** Compares images, reporting the first differing pixel instead of diffing whole arrays. */
export function expectSameImage(actual: Image, expected: Image): void {
  expect({
    width: actual.width,
    height: actual.height,
    type: actual.data.constructor.name,
    length: actual.data.length,
  }).toEqual({
    width: expected.width,
    height: expected.height,
    type: expected.data.constructor.name,
    length: expected.data.length,
  });
  const a = actual.data;
  const e = expected.data;
  for (let i = 0; i < e.length; i++) {
    if (a[i] !== e[i]) {
      const p = i - (i % 4);
      const pixel = p / 4;
      expect(
        Array.from(a.subarray(p, p + 4)),
        `pixel ${pixel} (x=${pixel % expected.width}, y=${Math.floor(pixel / expected.width)})`,
      ).toEqual(Array.from(e.subarray(p, p + 4)));
    }
  }
}

/** Compares decode outcomes, comparing images with {@link expectSameImage}. */
export function expectSameDecodeOutcome(
  actual: DecodeOutcome,
  expected: DecodeOutcome,
): void {
  if ("result" in actual && "result" in expected) {
    const { image: actualImage, ...actualRest } = actual.result;
    const { image: expectedImage, ...expectedRest } = expected.result;
    expect(actualRest).toEqual(expectedRest);
    expectSameImage(actualImage, expectedImage);
  } else {
    expect(actual).toEqual(expected);
  }
}

// --- png structure ---------------------------------------------------------------------------

export interface RawChunk {
  type: string;
  data: Uint8Array;
}

export function readChunks(png: Uint8Array): RawChunk[] {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const chunks: RawChunk[] = [];
  for (let offset = 8; offset < png.length;) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...png.subarray(offset + 4, offset + 8));
    chunks.push({ type, data: png.subarray(offset + 8, offset + 8 + length) });
    offset += 12 + length;
  }
  return chunks;
}

/**
 * Compares two pngs. The compressed bytes depend on the platform's zlib, so instead of comparing
 * bytes, all chunks except IDAT must be identical and the IDAT data must be identical once
 * inflated (i.e. the same filtered scanlines).
 */
export function expectEquivalentPng(
  actual: Uint8Array,
  expected: Uint8Array,
): void {
  expect(Array.from(actual.subarray(0, 8)), "signature").toEqual(
    Array.from(expected.subarray(0, 8)),
  );
  const describe = (png: Uint8Array): unknown[] =>
    readChunks(png).map((c) =>
      c.type === "IDAT"
        ? { type: "IDAT" }
        : { type: c.type, data: Buffer.from(c.data).toString("hex") },
    );
  expect(describe(actual)).toEqual(describe(expected));
  const inflated = (png: Uint8Array): Buffer =>
    inflateSync(
      Buffer.concat(
        readChunks(png)
          .filter((c) => c.type === "IDAT")
          .map((c) => c.data),
      ),
    );
  expect(
    inflated(actual).equals(inflated(expected)),
    "inflated IDAT data is identical",
  ).toBe(true);
}
