import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { MAX_FILE_SIZE_BYTES } from "@/lib/import/validate-file";

const runSpectoraImport = vi.hoisted(() => vi.fn());
vi.mock("@/lib/persistence/import-service", () => ({ runSpectoraImport }));

const { POST } = await import("./route");

beforeEach(() => {
  runSpectoraImport.mockReset();
  runSpectoraImport.mockResolvedValue({
    success: true,
    importRunId: "run-1",
    templateId: "tpl-1",
    issueCount: 0,
    error: null,
  });
});

afterEach(() => vi.restoreAllMocks());

function uploadRequest(file: File | null, headers: Record<string, string> = {}): Request {
  const body = new FormData();
  if (file) body.set("file", file);
  return new Request("http://localhost/api/import", { method: "POST", body, headers });
}

function xlsxFile(name = "template.xlsx", size = 64): File {
  const bytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.alloc(Math.max(0, size - 4))]);
  return new File([bytes], name, {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

describe("POST /api/import — size guard", () => {
  it("rejects an oversized upload before reading the body", async () => {
    // The declared length alone must be enough. If this test ever passes only
    // because the body was parsed, the memory-exhaustion guard is gone.
    const response = await POST(
      uploadRequest(xlsxFile(), { "content-length": String(MAX_FILE_SIZE_BYTES + 1) })
    );

    expect(response.status).toBe(413);
    const body = await response.json();
    expect(body.errorCode).toBe("file_too_large");
    expect(body.success).toBe(false);
    expect(runSpectoraImport).not.toHaveBeenCalled();
  });

  it("rejects an oversized file when no content-length is declared", async () => {
    // Chunked uploads have no content-length — the real size is still checked.
    const response = await POST(uploadRequest(xlsxFile("big.xlsx", MAX_FILE_SIZE_BYTES + 1)));

    expect(response.status).toBe(413);
    expect((await response.json()).errorCode).toBe("file_too_large");
    expect(runSpectoraImport).not.toHaveBeenCalled();
  });

  it("allows a file exactly at the limit", async () => {
    const response = await POST(
      uploadRequest(xlsxFile(), { "content-length": String(MAX_FILE_SIZE_BYTES) })
    );
    expect(response.status).toBe(200);
  });
});

describe("POST /api/import — malformed requests", () => {
  it("rejects a request with no file field", async () => {
    const response = await POST(uploadRequest(null));
    expect(response.status).toBe(400);
    expect((await response.json()).errorCode).toBe("unsupported_file_type");
    expect(runSpectoraImport).not.toHaveBeenCalled();
  });

  it("rejects a body that isn't form data", async () => {
    const response = await POST(
      new Request("http://localhost/api/import", {
        method: "POST",
        body: "not form data",
        headers: { "content-type": "application/json" },
      })
    );
    expect(response.status).toBe(400);
    expect(runSpectoraImport).not.toHaveBeenCalled();
  });

  it("rejects a text field submitted under the file name", async () => {
    const body = new FormData();
    body.set("file", "../../etc/passwd");
    const response = await POST(new Request("http://localhost/api/import", { method: "POST", body }));
    expect(response.status).toBe(400);
    expect(runSpectoraImport).not.toHaveBeenCalled();
  });
});

describe("POST /api/import — delegation and failure reporting", () => {
  it("passes the uploaded bytes and filename to the importer", async () => {
    await POST(uploadRequest(xlsxFile("My Template.xlsx")));

    expect(runSpectoraImport).toHaveBeenCalledTimes(1);
    const call = runSpectoraImport.mock.calls[0][0];
    expect(call.filename).toBe("My Template.xlsx");
    expect(Buffer.isBuffer(call.buffer)).toBe(true);
    expect(call.buffer.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
  });

  it("returns 422 when the importer rejects the file's contents", async () => {
    runSpectoraImport.mockResolvedValue({
      success: false,
      importRunId: "run-2",
      templateId: null,
      issueCount: 1,
      error: "We couldn't find a section, item, and comment layout in that spreadsheet.",
    });

    const response = await POST(uploadRequest(xlsxFile()));
    expect(response.status).toBe(422);
    const body = await response.json();
    expect(body.success).toBe(false);
    // A rejected import still produces a traceable run the person can open.
    expect(body.importRunId).toBe("run-2");
  });

  it("returns a safe 500 without internal detail when persistence throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    runSpectoraImport.mockRejectedValue(
      new Error("Supabase server credentials are not configured. Set SUPABASE_SERVICE_ROLE_KEY.")
    );

    const response = await POST(uploadRequest(xlsxFile()));
    expect(response.status).toBe(500);

    const raw = JSON.stringify(await response.json());
    expect(raw).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(raw).not.toContain("Supabase");
  });
});
