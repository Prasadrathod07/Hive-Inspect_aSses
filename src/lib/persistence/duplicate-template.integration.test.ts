import { describe, it, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// The duplication action is a Server Action and calls revalidatePath, which
// needs a Next request scope that doesn't exist under Vitest. Stubbing it
// keeps the rest of the action — validation, the RPC call, the post-copy
// re-read and verification — running for real against the live database.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

const { runSpectoraImport } = await import("./import-service");
const { duplicateTemplate } = await import("./duplicate-template");
const { getEditableTemplate } = await import("./get-editable-template");
const { verifyDuplicateIndependence } = await import("./verify-duplicate-independence");

/**
 * Live-database proofs for the six independence requirements. Gated behind
 * the same explicit opt-in as the import integration tests, so a normal
 * `npm run test` never touches a real database.
 *
 * To run:
 *   1. Apply every migration in supabase/migrations/, in order.
 *   2. Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 *   3. RUN_SUPABASE_INTEGRATION_TESTS=1 npx vitest run duplicate-template.integration
 *
 * docs/db-verification.md documents how to confirm the same six things by
 * hand in the Supabase SQL editor, for when running these isn't practical.
 */
const hasCredentials = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
);
const isOptedIn = process.env.RUN_SUPABASE_INTEGRATION_TESTS === "1";
const shouldRun = hasCredentials && isOptedIn;

if (!shouldRun) {
  console.log(
    "[duplicate-template.integration.test] Skipped — requires NEXT_PUBLIC_SUPABASE_URL, " +
      "SUPABASE_SERVICE_ROLE_KEY, and RUN_SUPABASE_INTEGRATION_TESTS=1. See this file's header, " +
      "or docs/db-verification.md for the manual equivalent."
  );
}

const FIXTURE_PATH = path.resolve(__dirname, "../../../tests/fixtures/synthetic-spectora-like.xlsx");

describe.skipIf(!shouldRun)("duplicateTemplate — live Supabase independence proofs", () => {
  const client: SupabaseClient = shouldRun
    ? createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
    : (null as unknown as SupabaseClient);

  async function importSourceTemplate() {
    const result = await runSpectoraImport({
      buffer: readFileSync(FIXTURE_PATH),
      filename: "duplication-source.xlsx",
      client,
    });
    if (!result.success) throw new Error(`Fixture import failed: ${result.error}`);
    return { templateId: result.templateId, importRunId: result.importRunId };
  }

  async function cleanup(templateIds: (string | null)[], importRunIds: (string | null)[] = []) {
    for (const id of templateIds) {
      if (id) await client.from("templates").delete().eq("id", id);
    }
    for (const id of importRunIds) {
      if (id) await client.from("import_runs").delete().eq("id", id);
    }
  }

  it("proofs 1 + 2: the copy has the same content, with every id different", async () => {
    const source = await importSourceTemplate();
    const result = await duplicateTemplate(source.templateId, "Duplication Proof — Copy");

    expect(result.success).toBe(true);
    if (!result.success) return;

    const [original, copy] = await Promise.all([
      getEditableTemplate(source.templateId),
      getEditableTemplate(result.templateId),
    ]);
    expect(original).not.toBeNull();
    expect(copy).not.toBeNull();
    if (!original || !copy) return;

    const verification = verifyDuplicateIndependence(original, copy);
    expect(verification.violations).toEqual([]);
    expect(verification.independent).toBe(true);
    expect(verification.copiedNodeCount).toBeGreaterThan(0);

    // Lineage is recorded, but the copy is not a fresh import.
    expect(copy.parentTemplateId).toBe(source.templateId);
    expect(copy.importRunId).toBeNull();
    expect(result.independenceVerified).toBe(true);

    await cleanup([result.templateId, source.templateId], [source.importRunId]);
  });

  it("proof 3: renaming a section on the copy leaves the original's section unchanged", async () => {
    const source = await importSourceTemplate();
    const result = await duplicateTemplate(source.templateId, "Section Edit Proof — Copy");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const copy = await getEditableTemplate(result.templateId);
    const originalBefore = await getEditableTemplate(source.templateId);
    if (!copy || !originalBefore) throw new Error("Could not read templates back.");

    const copySection = copy.sections[0];
    const originalSectionName = originalBefore.sections[0].name;

    // Exactly what updateSectionName does under the hood: update … where id = ?
    const { error } = await client
      .from("sections")
      .update({ name: "Renamed on the copy only" })
      .eq("id", copySection.id);
    expect(error).toBeNull();

    const [originalAfter, copyAfter] = await Promise.all([
      getEditableTemplate(source.templateId),
      getEditableTemplate(result.templateId),
    ]);

    expect(copyAfter?.sections[0].name).toBe("Renamed on the copy only");
    expect(originalAfter?.sections[0].name).toBe(originalSectionName);

    await cleanup([result.templateId, source.templateId], [source.importRunId]);
  });

  it("proof 4: editing a comment on the copy leaves the original's comment unchanged", async () => {
    const source = await importSourceTemplate();
    const result = await duplicateTemplate(source.templateId, "Comment Edit Proof — Copy");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const copy = await getEditableTemplate(result.templateId);
    const originalBefore = await getEditableTemplate(source.templateId);
    if (!copy || !originalBefore) throw new Error("Could not read templates back.");

    const findFirstComment = (template: NonNullable<typeof copy>) =>
      template.sections.flatMap((s) => s.items).flatMap((i) => i.comments)[0];

    const copyComment = findFirstComment(copy);
    const originalCommentText = findFirstComment(originalBefore).plainText;

    const { error } = await client
      .from("comments")
      .update({ plain_text: "Rewritten on the copy only.", safe_html: "<p>Rewritten on the copy only.</p>" })
      .eq("id", copyComment.id);
    expect(error).toBeNull();

    const [originalAfter, copyAfter] = await Promise.all([
      getEditableTemplate(source.templateId),
      getEditableTemplate(result.templateId),
    ]);

    expect(findFirstComment(copyAfter!).plainText).toBe("Rewritten on the copy only.");
    expect(findFirstComment(originalAfter!).plainText).toBe(originalCommentText);

    await cleanup([result.templateId, source.templateId], [source.importRunId]);
  });

  it("proof 5: deleting the copy entirely leaves the original fully intact", async () => {
    const source = await importSourceTemplate();
    const result = await duplicateTemplate(source.templateId, "Delete Proof — Copy");
    expect(result.success).toBe(true);
    if (!result.success) return;

    const originalBefore = await getEditableTemplate(source.templateId);
    if (!originalBefore) throw new Error("Could not read the original back.");

    // Cascades to the copy's sections/items/comments.
    const { error } = await client.from("templates").delete().eq("id", result.templateId);
    expect(error).toBeNull();

    const originalAfter = await getEditableTemplate(source.templateId);
    expect(originalAfter).toEqual(originalBefore);

    await cleanup([source.templateId], [source.importRunId]);
  });

  it("proof 6: a failed duplication leaves no partial data behind", async () => {
    const { count: templatesBefore } = await client
      .from("templates")
      .select("*", { count: "exact", head: true });
    const { count: sectionsBefore } = await client
      .from("sections")
      .select("*", { count: "exact", head: true });

    // No such template — the function raises, and its single transaction
    // rolls back anything it had written.
    const result = await duplicateTemplate("00000000-0000-0000-0000-000000000000", "Should Not Exist");

    expect(result.success).toBe(false);

    const { count: templatesAfter } = await client
      .from("templates")
      .select("*", { count: "exact", head: true });
    const { count: sectionsAfter } = await client
      .from("sections")
      .select("*", { count: "exact", head: true });

    expect(templatesAfter).toBe(templatesBefore);
    expect(sectionsAfter).toBe(sectionsBefore);
  });
});
