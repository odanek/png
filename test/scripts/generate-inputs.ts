/**
 * Generates the hand-crafted fixture inputs:
 *
 * - `fixtures/decode/custom/*.png`: pngs targeting zlib and compressed text edge cases.
 * - `fixtures/encode/*.json`: encoder inputs (image and options).
 *
 * Both directories are recreated from scratch, so their expected results must be regenerated
 * afterwards. Use `npm run fixtures:update`, which does both.
 *
 * Run with plain Node (no `src/` code is used, the inputs are independent of the implementation).
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { stringify } from "../lib/json.ts";
import {
  chunk,
  concat,
  ihdr,
  latin1,
  PNG_SIGNATURE,
  seededBytes,
  split,
  zlib,
} from "../lib/png-builder.ts";

const FIXTURES_DIR = join(import.meta.dirname, "..", "fixtures");
const CUSTOM_DIR = join(FIXTURES_DIR, "decode", "custom");
const ENCODE_DIR = join(FIXTURES_DIR, "encode");

// =============================================================================================
// Decoder inputs
// =============================================================================================

/** Filter-type-0 scanlines for an 8-bit RGBA image with deterministic content. */
function rawScanlines(width: number, height: number, seed: number): Uint8Array {
  const pixels = seededBytes(width * height * 4, seed);
  const out = new Uint8Array(height * (1 + width * 4));
  for (let y = 0; y < height; y++) {
    out.set(
      pixels.subarray(y * width * 4, (y + 1) * width * 4),
      y * (1 + width * 4) + 1,
    );
  }
  return out;
}

function png(
  idatParts: Uint8Array[],
  { width = 16, height = 16, extra = [] as Uint8Array[] } = {},
): Uint8Array {
  return concat(
    PNG_SIGNATURE,
    ihdr(width, height, 8, 6),
    ...extra,
    ...idatParts.map((p) => chunk("IDAT", p)),
    chunk("IEND"),
  );
}

function flipLastByte(data: Uint8Array): Uint8Array {
  const copy = data.slice();
  copy[copy.length - 1]! ^= 0xff;
  return copy;
}

function zTXt(keyword: string, compressed: Uint8Array): Uint8Array {
  // keyword \0 compression-method text
  return chunk(
    "zTXt",
    concat(latin1(keyword), new Uint8Array([0, 0]), compressed),
  );
}

function iTXt(keyword: string, compressed: Uint8Array): Uint8Array {
  // keyword \0 compression-flag compression-method language \0 translated-keyword \0 text
  return chunk(
    "iTXt",
    concat(
      latin1(keyword),
      new Uint8Array([0, 1, 0]),
      latin1("en"),
      new Uint8Array([0]),
      latin1("Title"),
      new Uint8Array([0]),
      compressed,
    ),
  );
}

function decodeInputs(): Record<string, Uint8Array> {
  const compressed = zlib(rawScanlines(16, 16, 42));
  const image = (extra: Uint8Array[]): Uint8Array =>
    png([compressed], { extra });
  const text = zlib(
    new TextEncoder().encode("Hello, compressed world! ".repeat(20)),
  );
  const junk = new Uint8Array([9, 9, 9]);

  return {
    // How the zlib stream is split into IDAT chunks must not matter
    "idat-single-chunk": png([compressed]),
    "idat-1-byte-chunks": png(split(compressed, 1)),
    "idat-7-byte-chunks": png(split(compressed, 7)),
    "idat-leading-empty-chunk": png([new Uint8Array(), compressed]),
    "idat-empty-chunks-between": png(
      split(compressed, 10).flatMap((p) => [p, new Uint8Array()]),
    ),
    "idat-many-chunks-128x128": png(
      split(zlib(rawScanlines(128, 128, 99)), 1024),
      {
        width: 128,
        height: 128,
      },
    ),

    // Malformed zlib streams
    "idat-truncated": png([compressed.subarray(0, compressed.length - 20)]),
    "idat-missing-checksum": png([
      compressed.subarray(0, compressed.length - 4),
    ]),
    "idat-bad-checksum": png([flipLastByte(compressed)]),
    "idat-bad-zlib-header": png([
      concat(new Uint8Array([0x12, 0x34]), compressed.subarray(2)),
    ]),
    "idat-random-bytes": png([seededBytes(200, 7)]),
    "idat-empty": png([new Uint8Array()]),
    "idat-too-little-data": png([
      zlib(rawScanlines(16, 16, 42).subarray(0, 100)),
    ]),
    // KNOWN LIMITATION (see TODO.md): pako ignored data after the end of the zlib stream, but
    // DecompressionStream rejects it, so these currently fail to decode.
    "idat-trailing-bytes": png([
      concat(compressed, new Uint8Array([1, 2, 3, 4, 5])),
    ]),
    "idat-trailing-bytes-in-separate-chunk": png([
      compressed,
      seededBytes(8, 12),
    ]),

    // Compressed text
    ztxt: image([zTXt("Comment", text)]),
    "ztxt-empty": image([zTXt("Comment", zlib(new Uint8Array()))]),
    "ztxt-truncated": image([
      zTXt("Comment", text.subarray(0, text.length - 6)),
    ]),
    "ztxt-corrupt": image([zTXt("Comment", seededBytes(40, 3))]),
    // KNOWN LIMITATION, see above
    "ztxt-trailing-bytes": image([zTXt("Comment", concat(text, junk))]),
    itxt: image([iTXt("Title", text)]),
    "itxt-utf8": image([
      iTXt("Title", zlib(new TextEncoder().encode("Žluťoučký kůň 🐎"))),
    ]),
    "itxt-corrupt": image([iTXt("Title", seededBytes(40, 5))]),
    // KNOWN LIMITATION, see above
    "itxt-trailing-bytes": image([iTXt("Title", concat(text, junk))]),
  };
}

// =============================================================================================
// Encoder inputs
// =============================================================================================

const ColorType = {
  Grayscale: 0,
  Truecolor: 2,
  Indexed: 3,
  GrayscaleAndAlpha: 4,
  TruecolorAndAlpha: 6,
} as const;

type Rgba = [number, number, number, number];
type PixelFn = (rand: () => number, max: number, i: number) => Rgba;
type Image = { width: number; height: number; data: Uint8Array | Uint16Array };

function makeImage(
  width: number,
  height: number,
  depth: 8 | 16,
  seed: number,
  pixel: PixelFn,
): Image {
  const max = depth === 16 ? 0xffff : 0xff;
  const noise = seededBytes(width * height * 16, seed);
  let n = 0;
  const rand = (): number =>
    depth === 16 ? (noise[n++]! << 8) | noise[n++]! : noise[n++]!;
  const data = new (depth === 16 ? Uint16Array : Uint8Array)(
    width * height * 4,
  );
  for (let i = 0; i < width * height; i++) {
    data.set(pixel(rand, max, i), i * 4);
  }
  return { width, height, data };
}

/** Gradients plus some noise, so the encoder picks a mix of filter types. */
const pixels = {
  gray: (r, max, i): Rgba => {
    const g = (i * 7 + (r() & 0x0f)) % (max + 1);
    return [g, g, g, max];
  },
  /**
   * Exactly one fully transparent gray, the rest opaque grays different from it: should use a
   * tRNS chunk.
   */
  grayOneTransparent: (r, max, i): Rgba => {
    if (i % 5 === 0) return [7, 7, 7, 0];
    const g = r();
    return g === 7 ? [8, 8, 8, max] : [g, g, g, max];
  },
  /** Like grayOneTransparent, but some opaque pixels have the same gray as the transparent one. */
  grayTransparentAlsoOpaque: (r, max, i): Rgba => {
    if (i % 5 === 0) return [7, 7, 7, 0];
    if (i % 5 === 1) return [7, 7, 7, max];
    const g = r();
    return [g, g, g, max];
  },
  grayAlpha: (r, max, i): Rgba => {
    const g = (i * 3) % (max + 1);
    return [g, g, g, r()];
  },
  rgb: (r, max, i): Rgba => [
    (i * 5) % (max + 1),
    r(),
    (i * 11 + 3) % (max + 1),
    max,
  ],
  rgba: (r): Rgba => [r(), r(), r(), r()],
  /**
   * Exactly one fully transparent color, the rest opaque colors different from it: should use a
   * tRNS chunk.
   */
  rgbOneTransparent: (r, max, i): Rgba => {
    if (i % 5 === 0) return [1, 2, 3, 0];
    const rgb = [r(), r(), r()];
    return rgb.join() === "1,2,3"
      ? [1, 2, 4, max]
      : [rgb[0]!, rgb[1]!, rgb[2]!, max];
  },
  /** Like rgbOneTransparent, but some opaque pixels have the same color as the transparent one. */
  rgbTransparentAlsoOpaque: (r, max, i): Rgba => {
    if (i % 5 === 0) return [1, 2, 3, 0];
    if (i % 5 === 1) return [1, 2, 3, max];
    return [r(), r(), r(), max];
  },
  /** Exactly one *partially* transparent color, the rest opaque: cannot be expressed by tRNS. */
  rgbOnePartiallyTransparent: (r, max, i): Rgba =>
    i % 5 === 0 ? [1, 2, 3, max >> 1] : [r(), r(), r(), max],
  /** A small palette with partial transparency. */
  palette: (r, max): Rgba => {
    const c = r() % 40;
    return [c * 6, 255 - c * 6, (c * 37) % 256, c % 4 === 0 ? 128 : max];
  },
} satisfies Record<string, PixelFn>;

const SHIFT_BUG =
  "16-bit tRNS color is written with `>> 48`/`>> 32` shifts, which JS truncates to 32 bits (see TODO.md)";
const PARTIAL_ALPHA_TRNS_BUG =
  "encoder uses tRNS when there is exactly one non-opaque color, even if it is only partially transparent";
const OPAQUE_TRNS_COLOR_BUG =
  "encoder uses tRNS for the single transparent color even if opaque pixels have the same color, making them transparent";

interface EncodeInput {
  description: string;
  image: Image;
  options: Record<string, unknown>;
  knownBug?: string;
}

function encodeInputs(): Record<string, EncodeInput> {
  const out: Record<string, EncodeInput> = {};
  const add = (name: string, input: EncodeInput): void => {
    out[name] = input;
  };

  const sizes: [number, number][] = [
    [1, 1],
    [7, 3],
    [64, 64],
  ];
  for (const [w, h] of sizes) {
    const size = `${w}x${h}`;
    for (const depth of [8, 16] as const) {
      const d = `${depth}bit`;
      const image = (seed: number, fn: PixelFn): Image =>
        makeImage(w, h, depth, seed, fn);
      add(`gray-${d}-${size}`, {
        description: "Grayscale",
        image: image(1, pixels.gray),
        options: { colorType: ColorType.Grayscale },
      });
      add(`gray-trns-${d}-${size}`, {
        description:
          "Grayscale with a single fully transparent gray, uses tRNS",
        image: image(10, pixels.grayOneTransparent),
        options: { colorType: ColorType.Grayscale },
      });
      add(`gray-trns-also-opaque-${d}-${size}`, {
        description:
          "Grayscale with a single fully transparent gray that is also used by opaque pixels",
        image: image(11, pixels.grayTransparentAlsoOpaque),
        options: { colorType: ColorType.Grayscale },
        // A single pixel cannot be both
        knownBug: w * h > 1 ? OPAQUE_TRNS_COLOR_BUG : undefined,
      });
      add(`gray-alpha-${d}-${size}`, {
        description: "Grayscale and alpha",
        image: image(2, pixels.grayAlpha),
        options: { colorType: ColorType.GrayscaleAndAlpha },
      });
      add(`rgb-${d}-${size}`, {
        description: "Truecolor",
        image: image(3, pixels.rgb),
        options: { colorType: ColorType.Truecolor },
      });
      add(`rgb-trns-${d}-${size}`, {
        description:
          "Truecolor with a single fully transparent color, uses tRNS",
        image: image(5, pixels.rgbOneTransparent),
        options: { colorType: ColorType.Truecolor },
        knownBug: depth === 16 ? SHIFT_BUG : undefined,
      });
      add(`rgb-trns-also-opaque-${d}-${size}`, {
        description:
          "Truecolor with a single fully transparent color that is also used by opaque pixels",
        image: image(12, pixels.rgbTransparentAlsoOpaque),
        options: { colorType: ColorType.Truecolor },
        knownBug:
          [depth === 16 && SHIFT_BUG, w * h > 1 && OPAQUE_TRNS_COLOR_BUG]
            .filter(Boolean)
            .join("; ") || undefined,
      });
      add(`rgb-partial-alpha-${d}-${size}`, {
        description: "Truecolor with a single partially transparent color",
        image: image(9, pixels.rgbOnePartiallyTransparent),
        options: { colorType: ColorType.Truecolor },
        knownBug: PARTIAL_ALPHA_TRNS_BUG,
      });
      add(`rgba-${d}-${size}`, {
        description: "Truecolor and alpha",
        image: image(4, pixels.rgba),
        options: { colorType: ColorType.TruecolorAndAlpha },
      });
      add(`rgba-auto-${d}-${size}`, {
        description: "Random RGBA with the color type picked by the encoder",
        image: image(6, pixels.rgba),
        options: {},
        // A single random 16-bit pixel is one partially transparent color, encoded as truecolor
        knownBug:
          depth === 16 && w * h === 1 ? PARTIAL_ALPHA_TRNS_BUG : undefined,
      });
    }
    add(`indexed-8bit-${size}`, {
      description: "Indexed with partial transparency",
      image: makeImage(w, h, 8, 7, pixels.palette),
      options: { colorType: ColorType.Indexed },
    });
    add(`indexed-auto-8bit-${size}`, {
      description: "Few colors with the color type picked by the encoder",
      image: makeImage(w, h, 8, 8, pixels.palette),
      options: {},
    });
  }

  // Options and errors
  const rgba = makeImage(7, 3, 8, 4, pixels.rgba);
  add("error-data-length", {
    description: "Data length does not match the dimensions",
    image: { width: 2, height: 2, data: new Uint8Array(12) },
    options: {},
  });
  add("truecolor-with-transparency", {
    description:
      "Truecolor requested for an image with many transparent colors, upgraded with a warning",
    image: rgba,
    options: { colorType: ColorType.Truecolor },
  });
  add("truecolor-with-transparency-strict", {
    description:
      "Same as truecolor-with-transparency in strict mode, which throws the warning",
    image: rgba,
    options: { colorType: ColorType.Truecolor, strictMode: true },
  });
  add("text-chunks", {
    description: "Custom tEXt chunks instead of the default Software chunk",
    image: rgba,
    options: {
      ancillaryChunks: [
        { type: "tEXt", keyword: "Title", text: "Test image" },
        { type: "tEXt", keyword: "Author", text: "png tests" },
      ],
    },
  });
  add("no-text-chunks", {
    description: "No ancillary chunks, suppressing the default Software chunk",
    image: rgba,
    options: { ancillaryChunks: [] },
  });
  return out;
}

// =============================================================================================

function recreate(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
}

recreate(CUSTOM_DIR);
const decode = decodeInputs();
for (const [name, data] of Object.entries(decode)) {
  writeFileSync(join(CUSTOM_DIR, `${name}.png`), data);
}

recreate(ENCODE_DIR);
const encode = encodeInputs();
for (const [name, input] of Object.entries(encode)) {
  writeFileSync(join(ENCODE_DIR, `${name}.json`), stringify(input));
}

console.log(
  `Wrote ${Object.keys(decode).length} decoder inputs and ${Object.keys(encode).length} encoder inputs`,
);
