import { describe, expect, it } from "vitest";
import { normalizeForComparison, sha256Hex, sha256HexOfBuffer, textsMatch } from "./checksum";

describe("checksum helpers", () => {
  it("normalizeForComparison collapses whitespace and trims", () => {
    expect(normalizeForComparison("  Shingles   are\n\ngood  ")).toBe("Shingles are good");
  });

  it("sha256Hex is deterministic for the same input", () => {
    expect(sha256Hex("hello")).toBe(sha256Hex("hello"));
    expect(sha256Hex("hello")).not.toBe(sha256Hex("Hello"));
  });

  it("textsMatch treats whitespace-only differences as equal", () => {
    expect(textsMatch("Shingles are good.", "Shingles   are\ngood.")).toBe(true);
    expect(textsMatch("Shingles are good.", "Shingles are bad.")).toBe(false);
  });

  it("sha256HexOfBuffer is deterministic and hashes raw bytes, not text", () => {
    const a = Buffer.from([0x00, 0xff, 0x10, 0x42]);
    const b = Buffer.from([0x00, 0xff, 0x10, 0x42]);
    const c = Buffer.from([0x00, 0xff, 0x10, 0x43]);
    expect(sha256HexOfBuffer(a)).toBe(sha256HexOfBuffer(b));
    expect(sha256HexOfBuffer(a)).not.toBe(sha256HexOfBuffer(c));
    expect(sha256HexOfBuffer(a)).toHaveLength(64);
  });
});
