import { describe, expect, it } from "vitest";
import { validateFile, MAX_FILE_SIZE_BYTES } from "./validate-file";

describe("validateFile", () => {
  it("passes a normal-sized .xlsx buffer with a supported extension", () => {
    const result = validateFile({ buffer: Buffer.from("pretend xlsx bytes"), filename: "template.xlsx" });
    expect(result).toBeNull();
  });

  it("also accepts .xls", () => {
    const result = validateFile({ buffer: Buffer.from("pretend xls bytes"), filename: "template.xls" });
    expect(result).toBeNull();
  });

  it("rejects an empty file", () => {
    const result = validateFile({ buffer: Buffer.alloc(0), filename: "template.xlsx" });
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("blocking");
    expect(result?.explanation).toContain("empty");
  });

  it("rejects a file over the size limit", () => {
    const result = validateFile({
      buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1),
      filename: "template.xlsx",
    });
    expect(result).not.toBeNull();
    expect(result?.severity).toBe("blocking");
    expect(result?.explanation).toContain("exceeds");
  });

  it("rejects an unsupported file extension", () => {
    const result = validateFile({ buffer: Buffer.from("hello"), filename: "template.csv" });
    expect(result).not.toBeNull();
    expect(result?.explanation).toContain("Unsupported file type");
  });
});
