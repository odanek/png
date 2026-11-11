/**
 * Encoder tests: every `fixtures/encode/<name>.json` holds an input image and options (see
 * {@link EncodeFixture}). The image is encoded and compared against the expected warnings or
 * error in the JSON and against the expected `<name>.png`, see {@link expectEquivalentPng}. The
 * encoded png must also decode back to the input image.
 *
 * In addition, every decoded PngSuite image is encoded and decoded again.
 *
 * `npm run fixtures:update` (re)writes the expected results from the current encoder.
 */
import { existsSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { decodePng, encodePng } from "../src/index.ts";
import {
  DECODE_DIR,
  type DecodeFixture,
  ENCODE_DIR,
  type EncodeFixture,
  expectEquivalentPng,
  expectSameImage,
  listFiles,
  normalizeError,
  readBytes,
  readFixture,
  UPDATE,
  writeFixture,
} from "./lib/fixtures.ts";

const names = listFiles(ENCODE_DIR, ".json").map((f) =>
  f.replace(/\.json$/, ""),
);

async function encode(fixture: EncodeFixture): Promise<{
  png?: Uint8Array;
  expected: NonNullable<EncodeFixture["expected"]>;
}> {
  try {
    const result = await encodePng(fixture.image, fixture.options);
    return {
      png: result.data,
      expected: {
        warnings: result.warnings.map(normalizeError),
        info: result.info,
      },
    };
  } catch (e) {
    return { expected: { error: normalizeError(e) } };
  }
}

if (UPDATE) {
  describe("update encoder fixtures", () => {
    it.each(names)("%s", async (name) => {
      const jsonPath = join(ENCODE_DIR, `${name}.json`);
      const pngPath = join(ENCODE_DIR, `${name}.png`);
      const { description, image, options, knownBug } =
        readFixture<EncodeFixture>(jsonPath);
      const fixture: EncodeFixture = { description, image, options, knownBug };
      const { png, expected } = await encode(fixture);
      writeFixture(jsonPath, { ...fixture, expected });
      if (png) {
        writeFileSync(pngPath, png);
      } else {
        rmSync(pngPath, { force: true });
      }
    });
  });
} else {
  describe("encodePng", () => {
    for (const name of names) {
      const fixture = readFixture<EncodeFixture>(
        join(ENCODE_DIR, `${name}.json`),
      );
      const pngPath = join(ENCODE_DIR, `${name}.png`);

      describe(`${name}: ${fixture.description}`, () => {
        it("matches the expected result", async () => {
          if (!fixture.expected) {
            throw new Error(
              `Missing expected result, run "npm run fixtures:update"`,
            );
          }
          const { png, expected } = await encode(fixture);
          expect(expected).toEqual(fixture.expected);
          if (png) {
            expectEquivalentPng(png, readBytes(pngPath));
          } else {
            expect(existsSync(pngPath), `${pngPath} should not exist`).toBe(
              false,
            );
          }
        });

        if (fixture.expected && !("error" in fixture.expected)) {
          const test = fixture.knownBug ? it.fails : it;
          const title = fixture.knownBug
            ? `decodes back to the input [known bug: ${fixture.knownBug}]`
            : "decodes back to the input";
          test(title, async () => {
            const decoded = await decodePng(readBytes(pngPath), {
              strictMode: true,
            });
            expectSameImage(decoded.image, fixture.image);
          });
        }
      });
    }
  });

  describe("PngSuite images round-trip through encodePng", () => {
    const files = listFiles(join(DECODE_DIR, "pngsuite"), ".json");
    it.each(files)("%s", async (file) => {
      const fixture = readFixture<DecodeFixture>(
        join(DECODE_DIR, "pngsuite", file),
      );
      if (!("result" in fixture.expected)) return; // Invalid image
      const { image } = fixture.expected.result;
      const encoded = await encodePng(image);
      expectSameImage((await decodePng(encoded.data)).image, image);
    });
  });
}
