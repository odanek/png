/**
 * @license
 * Copyright (c) 2026 Ondrej Danek
 * Copyright (c) 2022 Daniel Imms <http://www.growingwiththeweb.com>
 * Released under MIT license. See LICENSE in the project root for details.
 */

import { createChunkDecodeWarning } from "./assert";
import type { IDecodeContext, IPngChunk } from "../shared/types";
import { inflate } from "../shared/z";

export async function readText(
  ctx: IDecodeContext,
  chunk: IPngChunk,
  textDecoder: TextDecoder | undefined,
  maxLength: number | undefined,
  offset: number,
  maxOffset: number,
  readTrailingNull: boolean,
  isCompressed?: boolean,
): Promise<{ bytesRead: number; text: string }> {
  const bytes = [];
  let i = 0;
  for (; maxLength === undefined || i < maxLength; i++) {
    if (!readTrailingNull && offset === maxOffset) {
      break;
    }

    let current;
    try {
      current = ctx.view.getUint8(offset);
    } catch (e: unknown) {
      if (
        e instanceof Error &&
        e.message === "Offset is outside the bounds of the DataView"
      ) {
        throw createChunkDecodeWarning(chunk, "EOF while reading text", offset);
      }
      throw e;
    }
    // Only check if not compressed as 0 is valid is deflated data
    if (!isCompressed && current === 0) {
      break;
    }
    offset++;
    bytes.push(current);
  }

  if (readTrailingNull && ctx.view.getUint8(offset) !== 0) {
    throw createChunkDecodeWarning(
      chunk,
      "No null character after text",
      offset,
    );
  }

  let typedArray = new Uint8Array(bytes);
  if (isCompressed) {
    try {
      typedArray = await inflate(typedArray);
    } catch (e) {
      throw createChunkDecodeWarning(
        chunk,
        `Inflate error while decompressing text: ${e instanceof Error ? e.message : String(e)}`,
        offset,
      );
    }
  }

  return {
    text: textDecoder
      ? textDecoder.decode(typedArray)
      : String.fromCharCode(...bytes),
    bytesRead: i + 1,
  };
}
