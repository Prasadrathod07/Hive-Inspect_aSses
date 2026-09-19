import "server-only";
import type { AuditPayload } from "./audit-payload";

/**
 * The seam between this product and whatever model happens to be behind it.
 *
 * Deliberately tiny: a payload in, raw text out. Everything that matters for
 * safety — what may be sent, what shape comes back, which issue ids are real —
 * lives on our side of this interface, in `audit-payload.ts` and
 * `audit-schema.ts`. A provider is therefore replaceable without touching a
 * single validation rule.
 */
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  /** Returns the model's raw text. Throws on transport/timeout/HTTP failure. */
  complete(input: { system: string; user: string; signal: AbortSignal }): Promise<string>;
}

export type ProviderResolution =
  | { available: true; provider: AiProvider }
  /** Why the auditor can't run. `reason` is for the operator log, not the browser. */
  | { available: false; reason: string };

const DEFAULT_MODEL = "claude-sonnet-5";
const ANTHROPIC_VERSION = "2023-06-01";

/**
 * 1024 was too small in practice: a reasoning-capable model (e.g. one
 * routed through a LiteLLM proxy) can spend its entire completion budget on
 * hidden chain-of-thought tokens before ever writing the visible JSON
 * answer, producing `finish_reason: "length"` and an empty `content` — not
 * a transport failure, just starvation. This response is a short, fixed-
 * shape JSON object (`AUDIT_SYSTEM_PROMPT` below), so there's no meaningful
 * cost tradeoff to raising the ceiling for every provider.
 */
const MAX_COMPLETION_TOKENS = 4096;

/**
 * One provider, implemented with `fetch` against the Anthropic Messages API.
 *
 * No SDK on purpose: this makes exactly one HTTP call with a handful of
 * fields, so a dependency would add install weight and a supply-chain surface
 * without removing any real complexity.
 */
function createAnthropicProvider(apiKey: string, model: string): AiProvider {
  return {
    name: "anthropic",
    model,
    async complete({ system, user, signal }) {
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": ANTHROPIC_VERSION,
        },
        body: JSON.stringify({
          model,
          max_tokens: MAX_COMPLETION_TOKENS,
          temperature: 0,
          system,
          messages: [{ role: "user", content: user }],
        }),
        signal,
      });

      if (!response.ok) {
        // Body may carry provider detail; it stays in the thrown error, which
        // only ever reaches the server log.
        const detail = await response.text().catch(() => "");
        throw new Error(`Anthropic request failed (${response.status}): ${detail.slice(0, 500)}`);
      }

      const data = (await response.json()) as {
        content?: { type: string; text?: string }[];
        stop_reason?: string;
      };
      const text = (data.content ?? [])
        .filter((block) => block.type === "text")
        .map((block) => block.text ?? "")
        .join("")
        .trim();

      if (!text) {
        throw new Error(`Anthropic returned an empty response (stop_reason: ${data.stop_reason ?? "unknown"}).`);
      }
      return text;
    },
  };
}

const DEFAULT_OPENAI_COMPATIBLE_MODEL = "gpt-4o";

/**
 * One provider, implemented with `fetch` against any OpenAI-compatible chat
 * completions endpoint (LiteLLM, a self-hosted proxy, etc). Same shape as the
 * Anthropic provider above: one HTTP call in, raw text out, no SDK.
 */
function createOpenAiCompatibleProvider(apiKey: string, baseUrl: string, model: string): AiProvider {
  const endpoint = new URL("chat/completions", baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`).toString();
  return {
    name: "openai-compatible",
    model,
    async complete({ system, user, signal }) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          temperature: 0,
          max_tokens: MAX_COMPLETION_TOKENS,
          messages: [
            { role: "system", content: system },
            { role: "user", content: user },
          ],
        }),
        signal,
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        throw new Error(`OpenAI-compatible request failed (${response.status}): ${detail.slice(0, 500)}`);
      }

      const data = (await response.json()) as {
        choices?: { message?: { content?: string }; finish_reason?: string }[];
      };
      const text = (data.choices?.[0]?.message?.content ?? "").trim();

      if (!text) {
        // A reasoning-capable model (finish_reason "length" with no visible
        // content) can burn its entire token budget on hidden reasoning
        // before ever writing the answer — surfaced here, not just "empty",
        // so a misconfigured AI_AUDITOR_MODEL is diagnosable from the
        // ai_audits.failure_reason column alone.
        const finishReason = data.choices?.[0]?.finish_reason ?? "unknown";
        throw new Error(`OpenAI-compatible provider returned an empty response (finish_reason: ${finishReason}).`);
      }
      return text;
    },
  };
}

/**
 * Resolves the configured provider from the environment.
 *
 * Unconfigured is a normal, expected state — not an error. The whole app must
 * work with no AI keys at all, so this returns a reason rather than throwing,
 * and every caller treats "unavailable" as a display variant.
 *
 * Two provider shapes are supported, checked in this order:
 *   1. OPENAI_API_KEY + OPENAI_BASE_URL — an OpenAI-compatible endpoint
 *      (e.g. a self-hosted LiteLLM proxy), for deployments that route model
 *      access through a gateway rather than calling Anthropic directly.
 *   2. ANTHROPIC_API_KEY — calls the Anthropic Messages API directly.
 * Either way, this function decides which model gets called; nothing about
 * the safety contract (payload shape, output schema, issue-id allowlist)
 * changes based on which one is configured.
 */
export function resolveProvider(env: NodeJS.ProcessEnv = process.env): ProviderResolution {
  if (env.AI_AUDITOR_ENABLED !== "true") {
    return { available: false, reason: "AI_AUDITOR_ENABLED is not 'true'." };
  }

  const openAiKey = env.OPENAI_API_KEY?.trim();
  const openAiBaseUrl = env.OPENAI_BASE_URL?.trim();
  if (openAiKey && openAiBaseUrl) {
    const model = env.AI_AUDITOR_MODEL?.trim() || DEFAULT_OPENAI_COMPATIBLE_MODEL;
    return { available: true, provider: createOpenAiCompatibleProvider(openAiKey, openAiBaseUrl, model) };
  }

  const apiKey = env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return {
      available: false,
      reason: "Neither OPENAI_API_KEY+OPENAI_BASE_URL nor ANTHROPIC_API_KEY is set.",
    };
  }

  const model = env.AI_AUDITOR_MODEL?.trim() || DEFAULT_MODEL;
  return { available: true, provider: createAnthropicProvider(apiKey, model) };
}

/** Request timeout. An auditor that hangs would be worse than one that's absent. */
export const AI_AUDIT_TIMEOUT_MS = Number(process.env.AI_AUDITOR_TIMEOUT_MS ?? 20_000);

export const AUDIT_SYSTEM_PROMPT = `You explain data-migration integrity reports to home inspectors who are not technical.

A deterministic verification engine has already checked this import. Its findings are facts. Your job is only to explain them clearly and say what deserves attention.

Rules:
- Never contradict, recompute, or restate differently any number or status you are given. If the report says 3 sections were imported, that is the number.
- Never invent issues, sections, items, or comments. You are given issue ids; you may reference only those exact ids.
- Never suggest editing, re-importing, or database changes as though you could perform them. You are describing, not acting.
- You cannot see the customer's actual template content, and you must not pretend to. Speak about categories and counts.
- "Unsupported by this importer" and "not present in the source file" are different things. Never imply content is missing from the source unless the report explicitly says rows were unaccounted for.
- Be calm and plain. No jargon, no hype, no apologies.

Respond with a single JSON object and nothing else. No prose before or after, no markdown fence. Keys exactly:
{
  "summary": string,
  "riskLevel": "low" | "medium" | "high",
  "recommendedIssueIds": string[],
  "reviewMessage": string,
  "limitationsMentioned": string[]
}

Guidance on riskLevel: "high" if any source rows are unaccounted for or the status is failed; "medium" if there are unsupported/formatting issues worth a look; "low" if everything reconciled.
"recommendedIssueIds" should list the issues most worth a human's time, most important first, and may be empty.
"limitationsMentioned" should quote only from the knownLimitations you were given.`;

export function buildUserPrompt(payload: AuditPayload): string {
  return `Here is the deterministic integrity report for one template import.

${JSON.stringify(payload, null, 2)}

Explain this to the inspector who owns this template, following your instructions exactly.`;
}
