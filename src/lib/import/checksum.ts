import { createHash } from "node:crypto";

/**
 * Deterministic text-comparison helpers. No LLM, no fuzzy matching — a
 * plain, reproducible hash and a whitespace-normalized equality check.
 * These are the building blocks a (future) integrity engine uses to verify
 * "the imported text matches the source text," and are exercised now in
 * this pipeline's own preservation-verification tests.
 */

/** Collapses runs of whitespace and trims. This is the bar for "preserved exactly" — not a mutation applied to stored content, only to the comparison. */
export function normalizeForComparison(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Deterministic SHA-256 hex digest of the given text. */
export function sha256Hex(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}

/** Deterministic SHA-256 hex digest of raw binary content — for hashing the uploaded file itself, not text content. */
export function sha256HexOfBuffer(buffer: ArrayBuffer | Buffer): string {
  const bytes = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  return createHash("sha256").update(bytes).digest("hex");
}

/** True if two strings are identical after whitespace normalization. */
export function textsMatch(a: string, b: string): boolean {
  return normalizeForComparison(a) === normalizeForComparison(b);
}
