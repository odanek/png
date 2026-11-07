/**
 * @license
 * Copyright (c) 2026 Ondrej Danek
 * Copyright (c) 2022 Daniel Imms <http://www.growingwiththeweb.com>
 * Released under MIT license. See LICENSE in the project root for details.
 */

import {
  assertChunkDataLengthEquals,
  assertChunkMutualExclusion,
  assertChunkPrecedes,
  assertChunkSinglular,
  createChunkDecodeWarning,
} from "../assert";
import {
  ChunkPartByteLength,
  type IDecodeContext,
  type IPngChunk,
  type IPngHeaderDetails,
  type IPngMetadataStandardRgbColorSpace,
  KnownChunkTypes,
  RenderingIntent,
} from "../../shared/types";

/**
 * `sRGB` Standard RGB color space
 *
 * Spec: https://www.w3.org/TR/PNG/#11sRGB
 */
export async function parseChunk(
  ctx: IDecodeContext,
  header: IPngHeaderDetails,
  chunk: IPngChunk,
): Promise<IPngMetadataStandardRgbColorSpace> {
  assertChunkSinglular(ctx, chunk);
  assertChunkMutualExclusion(ctx, chunk, KnownChunkTypes.iCCP);
  assertChunkPrecedes(ctx, chunk, KnownChunkTypes.PLTE);
  assertChunkPrecedes(ctx, chunk, KnownChunkTypes.IDAT);
  assertChunkDataLengthEquals(ctx, chunk, 1);

  const offset =
    chunk.offset + ChunkPartByteLength.Length + ChunkPartByteLength.Type;
  const byte = ctx.view.getUint8(offset);
  let renderingIntent: RenderingIntent;
  switch (byte) {
    case RenderingIntent.Perceptual:
    case RenderingIntent.RelativeColorimetric:
    case RenderingIntent.Saturation:
    case RenderingIntent.AbsoluteColorimetric:
      renderingIntent = byte;
      break;
    default:
      throw createChunkDecodeWarning(
        chunk,
        `Invalid rendering intent "${byte}"`,
        offset,
      );
  }

  return {
    type: "sRGB",
    renderingIntent,
  };
}
