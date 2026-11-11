/**
 * @license
 * Copyright (c) 2026 Ondrej Danek
 * Copyright (c) 2022 Daniel Imms <http://www.growingwiththeweb.com>
 * Released under MIT license. See LICENSE in the project root for details.
 */

import {
  assertChunkDataLengthEquals,
  assertChunkFollows,
  assertChunkPrecedes,
  assertChunkSinglular,
} from "../assert.js";
import {
  ChunkPartByteLength,
  type IDecodeContext,
  type IPngChunk,
  type IPngHeaderDetails,
  type IPngMetadataHistogram,
  KnownChunkTypes,
} from "../../shared/types.js";

/**
 * `hIST` Image histogram
 *
 * Spec: https://www.w3.org/TR/PNG/#11hIST
 */
export async function parseChunk(
  ctx: IDecodeContext,
  header: IPngHeaderDetails,
  chunk: IPngChunk,
): Promise<IPngMetadataHistogram> {
  assertChunkSinglular(ctx, chunk);
  assertChunkFollows(ctx, chunk, KnownChunkTypes.PLTE);
  assertChunkPrecedes(ctx, chunk, KnownChunkTypes.IDAT);
  assertChunkDataLengthEquals(ctx, chunk, ctx.palette!.size * 2);

  const offset =
    chunk.offset + ChunkPartByteLength.Length + ChunkPartByteLength.Type;
  const frequency: number[] = [];
  for (let i = 0; i < ctx.palette!.size * 2; i += 2) {
    frequency.push(ctx.view.getUint16(offset + i));
  }

  return {
    type: "hIST",
    frequency,
  };
}
