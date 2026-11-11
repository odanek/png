# @odanek/png

Zero-dependency PNG decoder and encoder for the web and Node.js.

- No runtime dependencies. Compression uses the platform's built-in
  `CompressionStream` / `DecompressionStream`.
- Works in browsers and Node.js 18+.
- Decodes all PNG color types and bit depths, including Adam7-interlaced and
  16-bit images.
- Decodes the standard ancillary chunks (`tEXt`, `zTXt`, `iTXt`, `tIME`,
  `pHYs`, `gAMA`, `iCCP`, `eXIf`, ...) as metadata on request.
- Written in TypeScript, ships with type declarations.

This library is based on [lunapaint/png-codec](https://github.com/lunapaint/png-codec)
but replaces the `pako` dependency with the native compression streams.

## Installation

```sh
npm install @odanek/png
```

The package is ESM only. It can still be loaded with `require()` on Node.js
versions that support requiring ES modules (20.19+, 22.12+).

## Usage

### Decoding

```ts
import { readFile } from "node:fs/promises";
import { decodePng } from "@odanek/png";

const bytes = await readFile("image.png");
const { image, metadata, warnings } = await decodePng(bytes);

console.log(image.width, image.height);
// image.data is RGBA: Uint8Array for 8-bit images, Uint16Array for 16-bit images
```

In the browser:

```ts
const response = await fetch("/image.png");
const bytes = new Uint8Array(await response.arrayBuffer());
const { image } = await decodePng(bytes);
```

Decoding options:

| Option            | Description                                                                                                                                                                                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `force32`         | Convert 16-bit images to 8 bits per channel, so `image.data` is always a `Uint8Array`.                                                                                                                                |
| `parseChunkTypes` | Ancillary chunks to decode into `metadata`: a list such as `["tIME", "pHYs"]`, or `"*"` for all known chunks. By default only the chunks needed for the image data (`IHDR`, `PLTE`, `IDAT`, `IEND`, `tRNS`) are read. |
| `strictMode`      | Throw on the first warning instead of collecting it in `warnings`.                                                                                                                                                    |

```ts
const { image, metadata } = await decodePng(bytes, {
  force32: true,
  parseChunkTypes: "*",
});
```

### Encoding

```ts
import { writeFile } from "node:fs/promises";
import { encodePng } from "@odanek/png";

const width = 2;
const height = 2;
// RGBA, 8 bits per channel (use a Uint16Array for 16 bits per channel)
const data = new Uint8Array([
  255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
]);

const { data: png, warnings } = await encodePng({ width, height, data });
await writeFile("out.png", png);
```

By default the encoder scans the image and picks the smallest color type and
bit depth that can represent it. Encoding options:

| Option            | Description                                                                                                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `colorType`       | Force a color type: `0` grayscale, `2` truecolor, `3` indexed, `4` grayscale + alpha, `6` truecolor + alpha. It may be overridden if the image can't be encoded with it. |
| `bitDepth`        | Force a bit depth (`1`, `2`, `4`, `8` or `16`). Passing it skips the scan of the image.                                                                                  |
| `ancillaryChunks` | Text chunks to write. A `Software=@odanek/png` text chunk is written by default; pass `[]` to omit it.                                                                   |
| `strictMode`      | Throw on the first warning instead of collecting it in `warnings`.                                                                                                       |

### Errors

Invalid input throws `DecodeError` / `EncodeError`. Both have an `offset`
property with the byte offset where the problem was found, and `DecodeError`
also carries `partiallyDecodedImage` with whatever was decoded before the
failure. Recoverable problems are reported as `DecodeWarning` / `EncodeWarning`
objects in the `warnings` array of the result, unless `strictMode` is enabled.

```ts
import { decodePng, DecodeError } from "@odanek/png";

try {
  await decodePng(bytes);
} catch (e) {
  if (e instanceof DecodeError) {
    console.error(`Invalid PNG at byte ${e.offset}: ${e.message}`);
  }
}
```

## Requirements

- **Runtime:** a modern browser or Node.js 18+. The global `CompressionStream`,
  `DecompressionStream` and `Response` must be available.
- **TypeScript:** 5.7 or newer. The type declarations use typed arrays with
  generic buffer types (`Uint8Array<ArrayBuffer>`), which older versions don't
  support.

## Known issues

- **16-bit truecolor with `tRNS`:** when encoding a 16-bit truecolor image
  using a `tRNS` chunk, the transparent color is written incorrectly.
- **Partial transparency:** if an image has a single non-opaque color that is
  only partially transparent, the encoder may still use `tRNS`, which can only
  express full transparency, so the alpha value is lost.
- **Shared transparent color:** if the transparent color is also used by
  opaque pixels, the encoder may still use `tRNS`, which makes those pixels
  transparent too.
- **Trailing zlib bytes:** images with extra bytes after the end of the zlib
  stream in `IDAT`, `zTXt` or `iTXt` fail to decode, whereas the original
  library tolerated them.

Forcing `colorType: 6` (truecolor + alpha) avoids the three encoder issues.

## License

[MIT](./LICENSE)
