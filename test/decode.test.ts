/**
 * Decoder tests: every `fixtures/decode/**\/<name>.png` is decoded and compared against the
 * expected results in `<name>.json` (see {@link DecodeFixture}).
 *
 * `npm run fixtures:update` (re)writes the expected results from the current decoder.
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { describe, expect, it } from "vitest";
import { decodePng, type IDecodePngOptions } from "../src/index.ts";
import {
  DECODE_DIR,
  type DecodeFixture,
  type DecodeOutcome,
  decodeOutcome,
  expectSameDecodeOutcome,
  type Image,
  listFiles,
  readBytes,
  readFixture,
  UPDATE,
  writeFixture,
} from "./lib/fixtures.ts";

const files = listFiles(DECODE_DIR, ".png");

const modes = {
  expected: { parseChunkTypes: "*" },
  strict: { parseChunkTypes: "*", strictMode: true },
  force32: { parseChunkTypes: "*", force32: true },
} satisfies Record<keyof DecodeFixture, IDecodePngOptions>;

type Mode = keyof typeof modes;

function decode(file: string, mode: Mode): Promise<DecodeOutcome> {
  const data = readBytes(join(DECODE_DIR, file));
  return decodeOutcome(() => decodePng(data, modes[mode]));
}

function fixturePath(file: string): string {
  return join(DECODE_DIR, file.replace(/\.png$/, ".json"));
}

/** The outcome a fixture expects for `mode`, expanding the "same" shorthands. */
function expectedOutcome(fixture: DecodeFixture, mode: Mode): DecodeOutcome {
  switch (mode) {
    case "expected":
      return fixture.expected;
    case "strict":
      return fixture.strict === "same" ? fixture.expected : fixture.strict;
    case "force32":
      if (fixture.force32 === "same") return fixture.expected;
      if (!("result" in fixture.expected))
        throw new Error("force32 image without a result");
      return {
        result: { ...fixture.expected.result, image: fixture.force32.image },
      };
  }
}

async function createFixture(file: string): Promise<DecodeFixture> {
  const expected = await decode(file, "expected");
  const strict = await decode(file, "strict");
  const force32 = await decode(file, "force32");

  let force32Entry: DecodeFixture["force32"] = "same";
  if (!isDeepStrictEqual(force32, expected)) {
    // Only the image data is expected to differ (16-bit images converted to 8-bit)
    if (
      !("result" in force32) ||
      !("result" in expected) ||
      !isDeepStrictEqual(
        { ...force32.result, image: null },
        { ...expected.result, image: null },
      )
    ) {
      throw new Error(`${file}: force32 changed more than the image data`);
    }
    force32Entry = { image: force32.result.image as Image };
  }

  return {
    expected,
    strict: isDeepStrictEqual(strict, expected) ? "same" : strict,
    force32: force32Entry,
  };
}

if (UPDATE) {
  describe("update decoder fixtures", () => {
    it.each(files)("%s", async (file) => {
      writeFixture(fixturePath(file), await createFixture(file));
    });
  });
} else {
  describe("decodePng", () => {
    for (const mode of Object.keys(modes) as Mode[]) {
      describe(`${mode === "expected" ? "default" : mode} ${JSON.stringify(modes[mode])}`, () => {
        it.each(files)("%s", async (file) => {
          const fixture = readFixture<DecodeFixture>(fixturePath(file));
          expectSameDecodeOutcome(
            await decode(file, mode),
            expectedOutcome(fixture, mode),
          );
        });
      });
    }
  });

  describe("fixtures", () => {
    it("include PngSuite and custom images", () => {
      expect(
        files.filter((f) => f.startsWith("pngsuite/")).length,
      ).toBeGreaterThan(150);
      expect(
        files.filter((f) => f.startsWith("custom/")).length,
      ).toBeGreaterThan(10);
    });

    it("expect valid PngSuite images (not prefixed with x) to decode", () => {
      const failing = files
        .filter((f) => /^pngsuite\/[^x]/.test(f))
        .filter(
          (f) =>
            !("result" in readFixture<DecodeFixture>(fixturePath(f)).expected),
        );
      expect(failing).toEqual([]);
    });

    it("have no expected results without an image", () => {
      const orphaned = listFiles(DECODE_DIR, ".json").filter(
        (f) => !existsSync(join(DECODE_DIR, f.replace(/\.json$/, ".png"))),
      );
      expect(orphaned).toEqual([]);
    });
  });
}
