/**
 * @license
 * Copyright (c) 2026 Ondrej Danek
 * Copyright (c) 2022 Daniel Imms <http://www.growingwiththeweb.com>
 * Released under MIT license. See LICENSE in the project root for details.
 */

import { writeChunk } from "../write";

export function encodeChunk(): Uint8Array {
  return writeChunk("IEND", new Uint8Array(0));
}
