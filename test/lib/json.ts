/**
 * A JSON encoding for fixture files that can represent the values the codec produces and
 * consumes but plain JSON cannot. These are written as single-key tagged objects:
 *
 * - `Uint8Array`: `{ "$uint8": "<base64>" }`
 * - `Uint16Array`: `{ "$uint16": "<base64 of the little-endian bytes>" }`
 * - `ArrayBuffer`: `{ "$arrayBuffer": "<base64>" }`
 * - `Date`: `{ "$date": "<ISO 8601>" }`
 * - `NaN` and infinities: `{ "$number": "NaN" | "Infinity" | "-Infinity" }`
 *
 * Properties whose value is `undefined` are omitted.
 *
 * This file only uses Node APIs so it can be run directly by Node (see `scripts/`).
 */

export type Json =
  null | boolean | number | string | Json[] | { [key: string]: Json };

export function toJson(value: unknown): Json {
  if (
    value === null ||
    typeof value === "boolean" ||
    typeof value === "string"
  ) {
    return value;
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : { $number: String(value) };
  }
  if (value instanceof Uint8Array) {
    return { $uint8: toBase64(value) };
  }
  if (value instanceof Uint16Array) {
    const bytes = new Uint8Array(value.length * 2);
    const view = new DataView(bytes.buffer);
    value.forEach((v, i) => view.setUint16(i * 2, v, true));
    return { $uint16: toBase64(bytes) };
  }
  if (value instanceof ArrayBuffer) {
    return { $arrayBuffer: toBase64(new Uint8Array(value)) };
  }
  if (value instanceof Date) {
    return { $date: value.toISOString() };
  }
  if (Array.isArray(value)) {
    return value.map(toJson);
  }
  if (typeof value === "object") {
    const out: { [key: string]: Json } = {};
    for (const [k, v] of Object.entries(value)) {
      if (v !== undefined) out[k] = toJson(v);
    }
    return out;
  }
  throw new Error(`Cannot represent ${typeof value} in fixture JSON`);
}

export function fromJson(json: Json): unknown {
  if (json === null || typeof json !== "object") {
    return json;
  }
  if (Array.isArray(json)) {
    return json.map(fromJson);
  }
  const keys = Object.keys(json);
  if (keys.length === 1) {
    const tagged = json[keys[0]!];
    switch (keys[0]) {
      case "$uint8":
        return fromBase64(tagged as string);
      case "$uint16": {
        const bytes = fromBase64(tagged as string);
        const view = new DataView(
          bytes.buffer,
          bytes.byteOffset,
          bytes.byteLength,
        );
        return Uint16Array.from({ length: bytes.length / 2 }, (_, i) =>
          view.getUint16(i * 2, true),
        );
      }
      case "$arrayBuffer":
        return fromBase64(tagged as string).buffer;
      case "$date":
        return new Date(tagged as string);
      case "$number":
        return Number(tagged);
    }
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(json)) {
    out[k] = fromJson(v);
  }
  return out;
}

export function stringify(value: unknown): string {
  return `${JSON.stringify(toJson(value), null, 2)}\n`;
}

export function parse(text: string): unknown {
  return fromJson(JSON.parse(text) as Json);
}

function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString(
    "base64",
  );
}

function fromBase64(text: string): Uint8Array {
  // Copy into a fresh, exactly sized buffer: Buffer.from may return a view into a shared pool
  return new Uint8Array(Buffer.from(text, "base64"));
}
