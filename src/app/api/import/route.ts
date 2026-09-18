import { runSpectoraImport } from "@/lib/persistence/import-service";

// File parsing (SheetJS) and hashing (node:crypto) need Node APIs the Edge
// runtime doesn't provide — this route must run on Node, not Edge.
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { success: false, importRunId: null, error: "Expected multipart/form-data.", issueCount: 0 },
      { status: 400 }
    );
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return Response.json(
      { success: false, importRunId: null, error: "No file provided under the 'file' field.", issueCount: 0 },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = await runSpectoraImport({ buffer, filename: file.name });
  } catch (error) {
    // Only reachable for infrastructure failures (e.g. missing Supabase
    // credentials) — anything about the file itself is handled inside
    // runSpectoraImport and returned as a normal `success: false` result,
    // not thrown.
    return Response.json(
      {
        success: false,
        importRunId: null,
        error: error instanceof Error ? error.message : "Import failed unexpectedly.",
        issueCount: 0,
      },
      { status: 500 }
    );
  }

  return Response.json(result, { status: result.success ? 200 : 422 });
}
