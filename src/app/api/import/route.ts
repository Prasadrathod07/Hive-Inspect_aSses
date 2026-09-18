import { runSpectoraImport } from "@/lib/persistence/import-service";
import { MAX_FILE_SIZE_BYTES } from "@/lib/import/validate-file";
import { appError, toAppError, formatAppError, type AppError } from "@/lib/errors/app-error";

// File parsing (SheetJS) and hashing (node:crypto) need Node APIs the Edge
// runtime doesn't provide — this route must run on Node, not Edge.
export const runtime = "nodejs";

function errorResponse(error: AppError, status: number): Response {
  return Response.json(
    { success: false, importRunId: null, error: formatAppError(error), errorCode: error.code, issueCount: 0 },
    { status }
  );
}

export async function POST(request: Request): Promise<Response> {
  // Checked before touching the body. `request.formData()` buffers the whole
  // upload into memory, so the in-parser size limit alone would let a huge
  // POST be fully read before anything rejected it.
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > MAX_FILE_SIZE_BYTES) {
    return errorResponse(appError("file_too_large"), 413);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse(appError("unsupported_file_type"), 400);
  }

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse(appError("unsupported_file_type"), 400);
  }

  // A chunked upload has no content-length, so re-check the real size.
  if (file.size > MAX_FILE_SIZE_BYTES) {
    return errorResponse(appError("file_too_large"), 413);
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let result;
  try {
    result = await runSpectoraImport({ buffer, filename: file.name });
  } catch (error) {
    // Only reachable for infrastructure failures (e.g. missing Supabase
    // credentials). The real reason goes to the server log; the caller gets
    // a safe message, since this route is public and unauthenticated.
    return errorResponse(toAppError(error, "POST /api/import", "persistence_failed"), 500);
  }

  return Response.json(result, { status: result.success ? 200 : 422 });
}
