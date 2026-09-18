import { describe, expect, it } from "vitest";
import { validateFile, hasSpreadsheetSignature, MAX_FILE_SIZE_BYTES } from "./validate-file";

/** Real container signatures — an extension is a claim, these are the evidence. */
const ZIP_HEADER = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const OLE2_HEADER = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function xlsxBytes(body = "rest of the archive"): Buffer {
  return Buffer.concat([ZIP_HEADER, Buffer.from(body)]);
}

function xlsBytes(body = "rest of the compound file"): Buffer {
  return Buffer.concat([OLE2_HEADER, Buffer.from(body)]);
}

describe("validateFile", () => {
  it("passes a normal-sized .xlsx buffer with a supported extension", () => {
    expect(validateFile({ buffer: xlsxBytes(), filename: "template.xlsx" })).toBeNull();
  });

  it("also accepts .xls", () => {
    expect(validateFile({ buffer: xlsBytes(), filename: "template.xls" })).toBeNull();
  });

  it("accepts an ArrayBuffer as well as a Buffer", () => {
    const bytes = xlsxBytes();
    const arrayBuffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(arrayBuffer).set(bytes);
    expect(validateFile({ buffer: arrayBuffer, filename: "template.xlsx" })).toBeNull();
  });

  // Failure case 1 — wrong file type.
  it("rejects an unsupported file extension", () => {
    const result = validateFile({ buffer: xlsxBytes(), filename: "template.csv" });
    expect(result?.severity).toBe("blocking");
    expect(result?.explanation).toContain("Unsupported file type");
  });

  // Failure case 2 — empty file.
  it("rejects an empty file", () => {
    const result = validateFile({ buffer: Buffer.alloc(0), filename: "template.xlsx" });
    expect(result?.severity).toBe("blocking");
    expect(result?.explanation).toContain("empty");
  });

  it("rejects a file over the size limit", () => {
    const result = validateFile({
      buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1),
      filename: "template.xlsx",
    });
    expect(result?.severity).toBe("blocking");
    expect(result?.explanation).toContain("exceeds");
  });

  describe("content signature — an extension is a claim, not evidence", () => {
    it("rejects a PDF renamed to .xlsx", () => {
      const result = validateFile({
        buffer: Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3"),
        filename: "spectora-export.xlsx",
      });
      expect(result?.severity).toBe("blocking");
      expect(result?.explanation).toContain("named like a spreadsheet");
      expect(result?.explanation).toContain("Re-export from Spectora");
    });

    it("rejects a script renamed to .xlsx", () => {
      const result = validateFile({
        buffer: Buffer.from("#!/bin/sh\nrm -rf /\n"),
        filename: "template.xlsx",
      });
      expect(result?.severity).toBe("blocking");
      expect(result?.explanation).toContain("named like a spreadsheet");
    });

    it("keeps the rejected filename in the raw snippet for traceability", () => {
      const result = validateFile({ buffer: Buffer.from("not a spreadsheet"), filename: "renamed.xls" });
      expect(result?.rawSnippet).toBe("renamed.xls");
    });

    it("reports the size problem first when a file is both oversized and bogus", () => {
      // Size is the cheaper, more actionable complaint — don't tell someone to
      // re-export when the real problem is that the file is oversized.
      const result = validateFile({
        buffer: Buffer.alloc(MAX_FILE_SIZE_BYTES + 1),
        filename: "template.xlsx",
      });
      expect(result?.explanation).toContain("exceeds");
    });
  });
});

describe("hasSpreadsheetSignature", () => {
  it("recognizes a ZIP container (.xlsx)", () => {
    expect(hasSpreadsheetSignature(xlsxBytes())).toBe(true);
  });

  it("recognizes an OLE2 compound file (.xls)", () => {
    expect(hasSpreadsheetSignature(xlsBytes())).toBe(true);
  });

  it("rejects arbitrary bytes", () => {
    expect(hasSpreadsheetSignature(Buffer.from("PK is not at the start"))).toBe(false);
  });

  it("rejects a buffer shorter than the signature without throwing", () => {
    expect(hasSpreadsheetSignature(Buffer.from([0x50, 0x4b]))).toBe(false);
    expect(hasSpreadsheetSignature(Buffer.alloc(0))).toBe(false);
  });

  it("requires the signature at offset 0, not merely present", () => {
    expect(hasSpreadsheetSignature(Buffer.concat([Buffer.from("junk"), ZIP_HEADER]))).toBe(false);
  });
});
