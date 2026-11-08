# Todo

- Remove the dynamic encoder and decoder imports
- Remove the I prefix from types
- Don't use enums and enable the erasableSyntaxOnly rule in tsconfig.json
- Review the non-null assertions
- Fix the shift bug in encoder.ts and chunks/tRNS_encode.ts when BYTES_PER_ELEMENT === 2 (`<< 48`/`>> 48` etc. are truncated to 32 bits, so 16-bit truecolor images with a tRNS chunk get the wrong transparent color; see the `rgb-trns-16bit-*` encoder fixtures)
- Fix the encoder using tRNS when the single non-opaque color is only partially transparent (tRNS can only make a color fully transparent, so the alpha is lost; see the `rgb-partial-alpha-*` encoder fixtures)
- Fix the encoder using tRNS when the transparent color is also used by opaque pixels (they become transparent too; see the `*-trns-also-opaque-*` encoder fixtures)
- Fix the built package: relative imports in src/ have no .js extension, so dist/ fails to load in plain Node ESM and in TypeScript with moduleResolution nodenext
- Maybe tolerate trailing bytes after the end of the zlib stream in IDAT/zTXt/iTXt (pako ignored them, DecompressionStream rejects them; see the `*-trailing-bytes` fixtures in test/scripts/generate-inputs.ts)
