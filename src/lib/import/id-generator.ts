/**
 * Deterministic, injectable ID generation for the hierarchy builder.
 * Production imports use `crypto.randomUUID` (the default); tests and the
 * golden-fixture script inject a sequential generator so the same input
 * always produces byte-identical output — a "deterministic parser" should
 * mean deterministic IDs too, not just deterministic content.
 */
export function createSequentialIdGenerator(prefix = "id"): () => string {
  let counter = 0;
  return () => `${prefix}-${counter++}`;
}
