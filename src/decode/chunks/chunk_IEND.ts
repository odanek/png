/**
 * @license
 * Copyright (c) 2026 Ondrej Danek
 * Copyright (c) 2022 Daniel Imms <http://www.growingwiththeweb.com>
 * Released under MIT license. See LICENSE in the project root for details.
 */

import { assertChunkDataLengthEquals, assertChunkFollows } from "../assert";
import {
  type IDecodeContext,
  type IPngChunk,
  type IPngHeaderDetails,
  KnownChunkTypes,
} from "../../shared/types";

/**
 * `IEND` Image trailer
 *
 * Spec: https://www.w3.org/TR/PNG/#11IDAT
 */
export function parseChunk(
  ctx: IDecodeContext,
  header: IPngHeaderDetails,
  chunk: IPngChunk,
): void {
  assertChunkFollows(ctx, chunk, KnownChunkTypes.IDAT);
  assertChunkDataLengthEquals(ctx, chunk, 0);
}
