import { describe, expect, it, vi, afterEach } from "vitest";
import { resolveProvider } from "./provider";

describe("resolveProvider", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is unavailable when AI_AUDITOR_ENABLED is not exactly 'true'", () => {
    for (const enabled of [undefined, "false", "TRUE", "1", ""]) {
      const result = resolveProvider({ AI_AUDITOR_ENABLED: enabled } as unknown as NodeJS.ProcessEnv);
      expect(result.available).toBe(false);
    }
  });

  it("is unavailable when enabled but no provider credentials are set", () => {
    const result = resolveProvider({ AI_AUDITOR_ENABLED: "true" } as unknown as NodeJS.ProcessEnv);
    expect(result).toEqual({
      available: false,
      reason: "Neither OPENAI_API_KEY+OPENAI_BASE_URL nor ANTHROPIC_API_KEY is set.",
    });
  });

  it("resolves the Anthropic provider when only ANTHROPIC_API_KEY is set", () => {
    const result = resolveProvider({
      AI_AUDITOR_ENABLED: "true",
      ANTHROPIC_API_KEY: "sk-ant-test",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.provider.name).toBe("anthropic");
      expect(result.provider.model).toBe("claude-sonnet-5");
    }
  });

  it("resolves the OpenAI-compatible provider when OPENAI_API_KEY and OPENAI_BASE_URL are both set", () => {
    const result = resolveProvider({
      AI_AUDITOR_ENABLED: "true",
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "https://litellm.example.com/v1/",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.provider.name).toBe("openai-compatible");
      expect(result.provider.model).toBe("gpt-4o");
    }
  });

  it("prefers the OpenAI-compatible provider when both shapes are configured", () => {
    const result = resolveProvider({
      AI_AUDITOR_ENABLED: "true",
      ANTHROPIC_API_KEY: "sk-ant-test",
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "https://litellm.example.com/v1/",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.provider.name).toBe("openai-compatible");
    }
  });

  it("falls back to Anthropic when only OPENAI_API_KEY is set without a base URL", () => {
    const result = resolveProvider({
      AI_AUDITOR_ENABLED: "true",
      ANTHROPIC_API_KEY: "sk-ant-test",
      OPENAI_API_KEY: "sk-test",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.provider.name).toBe("anthropic");
    }
  });

  it("respects AI_AUDITOR_MODEL for whichever provider is configured", () => {
    const result = resolveProvider({
      AI_AUDITOR_ENABLED: "true",
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "https://litellm.example.com/v1/",
      AI_AUDITOR_MODEL: "custom-model",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.available).toBe(true);
    if (result.available) {
      expect(result.provider.model).toBe("custom-model");
    }
  });

  it("builds the OpenAI-compatible request against <baseUrl>/chat/completions and returns the message content", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: "  hello world  " } }] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = resolveProvider({
      AI_AUDITOR_ENABLED: "true",
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "https://litellm.example.com/v1",
    } as unknown as NodeJS.ProcessEnv);
    expect(result.available).toBe(true);
    if (!result.available) return;

    const controller = new AbortController();
    const text = await result.provider.complete({ system: "sys", user: "usr", signal: controller.signal });

    expect(text).toBe("hello world");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://litellm.example.com/v1/chat/completions",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("throws when the OpenAI-compatible endpoint returns a non-ok response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => "upstream error",
      })
    );

    const result = resolveProvider({
      AI_AUDITOR_ENABLED: "true",
      OPENAI_API_KEY: "sk-test",
      OPENAI_BASE_URL: "https://litellm.example.com/v1/",
    } as unknown as NodeJS.ProcessEnv);
    if (!result.available) throw new Error("expected provider to be available");

    const controller = new AbortController();
    await expect(
      result.provider.complete({ system: "sys", user: "usr", signal: controller.signal })
    ).rejects.toThrow(/OpenAI-compatible request failed \(500\)/);
  });
});
