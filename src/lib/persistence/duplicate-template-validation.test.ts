import { describe, expect, it } from "vitest";
import {
  deriveCopyName,
  DuplicateTemplateSchema,
  DuplicateRpcResultSchema,
  MAX_TEMPLATE_NAME_LENGTH,
} from "./duplicate-template-validation";

/** Template ids are Postgres uuids. */
const VALID_TEMPLATE_ID = "3f2504e0-4f89-41d3-9a0c-0305e82c3301";

describe("deriveCopyName", () => {
  it("proposes '[Original Name] — Copy'", () => {
    expect(deriveCopyName("Standard Home Inspection")).toBe("Standard Home Inspection — Copy");
  });

  it("trims the original name first", () => {
    expect(deriveCopyName("  Roof Template  ")).toBe("Roof Template — Copy");
  });

  it("keeps the result within the same length limit name edits use", () => {
    const result = deriveCopyName("x".repeat(MAX_TEMPLATE_NAME_LENGTH));
    expect(result.length).toBeLessThanOrEqual(MAX_TEMPLATE_NAME_LENGTH);
    expect(result.endsWith("— Copy")).toBe(true);
  });

  it("appends again when duplicating a duplicate, rather than trying to be clever", () => {
    expect(deriveCopyName("Template — Copy")).toBe("Template — Copy — Copy");
  });
});

describe("DuplicateTemplateSchema", () => {
  it("accepts a valid request and trims the name", () => {
    const result = DuplicateTemplateSchema.safeParse({ sourceTemplateId: VALID_TEMPLATE_ID, name: "  My Copy  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe("My Copy");
  });

  it("rejects an empty or whitespace-only name", () => {
    expect(DuplicateTemplateSchema.safeParse({ sourceTemplateId: VALID_TEMPLATE_ID, name: "" }).success).toBe(false);
    expect(DuplicateTemplateSchema.safeParse({ sourceTemplateId: VALID_TEMPLATE_ID, name: "   " }).success).toBe(false);
  });

  it("rejects a name over the length limit", () => {
    const result = DuplicateTemplateSchema.safeParse({
      sourceTemplateId: VALID_TEMPLATE_ID,
      name: "x".repeat(MAX_TEMPLATE_NAME_LENGTH + 1),
    });
    expect(result.success).toBe(false);
  });

  it("rejects a missing source template id", () => {
    expect(DuplicateTemplateSchema.safeParse({ sourceTemplateId: "", name: "Copy" }).success).toBe(false);
  });
});

describe("DuplicateRpcResultSchema", () => {
  it("accepts the shape the Postgres function returns", () => {
    const result = DuplicateRpcResultSchema.safeParse({
      template_id: "t-2",
      parent_template_id: "t-1",
      name: "Copy",
      section_count: 3,
      item_count: 5,
      comment_count: 8,
    });
    expect(result.success).toBe(true);
  });

  it("rejects a malformed result rather than trusting it", () => {
    expect(DuplicateRpcResultSchema.safeParse({ template_id: "t-2" }).success).toBe(false);
  });
});
