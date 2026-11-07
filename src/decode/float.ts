/**
 * @license
 * Copyright (c) 2026 Ondrej Danek
 * Copyright (c) 2022 Daniel Imms <http://www.growingwiththeweb.com>
 * Released under MIT license. See LICENSE in the project root for details.
 */

import { createChunkDecodeWarning, handleWarning } from "./assert";
import { readText } from "./text";
import type { IDecodeContext, IPngChunk } from "../shared/types";

export async function readFloat(
  ctx: IDecodeContext,
  chunk: IPngChunk,
  textDecoder: TextDecoder | undefined,
  offset: number,
  maxOffset: number,
  readTrailingNull: boolean,
): Promise<{ bytesRead: number; value: number }> {
  const readResult = await readText(
    ctx,
    chunk,
    textDecoder,
    undefined,
    offset,
    maxOffset,
    readTrailingNull,
  );
  offset += readResult.bytesRead;
  if (!isValidFloatingPoint(readResult.text)) {
    handleWarning(
      ctx,
      createChunkDecodeWarning(
        chunk,
        `Invalid character in floating point number ("${readResult.text}")`,
        offset,
      ),
    );
  }
  const value = parseFloat(readResult.text);
  return {
    bytesRead: readResult.bytesRead,
    value,
  };
}

function isValidFloatingPoint(text: string): RegExpMatchArray | null {
  return (
    text.match(/^[+-]?[0-9]+\.[0-9]+([eE][+-]?[0-9]+)?$/) ||
    text.match(/^[+-]?[0-9]+\.?([eE][+-]?[0-9]+)?$/) ||
    text.match(/^[+-]?\.[0-9]+([eE][+-]?[0-9]+)?$/)
  );
}
