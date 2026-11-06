/**
 * @license
 * Copyright (c) 2026 Ondrej Danek
 * Copyright (c) 2022 Daniel Imms <http://www.growingwiththeweb.com>
 * Released under MIT license. See LICENSE in the project root for details.
 */

import {
  ChunkPartByteLength,
  type IDecodeContext,
  type IPngChunk,
  type IPngHeaderDetails,
  type IPngMetadataExif,
} from "../../shared/types";

/**
 * `eXIf` Exchangeable image file format
 *
 * Spec: https://www.w3.org/TR/PNG/#11eXIf
 */
export function parseChunk(
  ctx: IDecodeContext,
  header: IPngHeaderDetails,
  chunk: IPngChunk,
): IPngMetadataExif {
  const offset =
    chunk.offset + ChunkPartByteLength.Length + ChunkPartByteLength.Type;
  return {
    type: "eXIf",
    value: ctx.view.buffer.slice(
      ctx.view.byteOffset + offset,
      ctx.view.byteOffset + offset + chunk.dataLength,
    ) as ArrayBuffer,
  };
}
