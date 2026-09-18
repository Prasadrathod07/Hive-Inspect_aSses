import sanitizeHtml from "sanitize-html";
import { sha256Hex } from "./checksum";
import type { LinkMetadata, NormalizationEventType } from "./types";

/**
 * Stage 5 (docs/architecture.md §2.5, §5, §5a): the sanitizer allowlist, the
 * link policy, and the three-way safe-normalization/recoverable/manual-review
 * split.
 *
 * Three outcomes for content outside the allowlist:
 *   - Level A (silent): a bare `<div>`/`<span>` wrapper with no attributes.
 *     Unwrapping it loses nothing — no attribute, no semantic hook, nothing —
 *     so it's removed automatically and only logged internally
 *     (`normalizationEvents`), never surfaced as a warning.
 *   - Level B ("Fix Safely"): the same wrapper tags, but WITH an attribute
 *     (class/style/id/data-*) that we can't prove is purely cosmetic. The
 *     unwrap is still mechanically identical and still provably
 *     text-preserving, so a fix is offered — but held for human confirmation
 *     rather than applied silently, since an attribute could (in principle)
 *     be carrying meaning this importer doesn't understand.
 *   - Level C (manual review): anything else outside the allowlist (tables,
 *     images, embeds, unknown tags, scripts). No proof of safe recoverability
 *     exists, so this never gets a "Fix Safely" action — same behavior as
 *     before this change.
 */
const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "br", "p", "ul", "ol", "li", "a"];
const ALLOWED_ATTRIBUTES: Record<string, string[]> = { a: ["href", "target", "rel"] };

/** Wrapper tags that, when found with no attributes, carry zero semantic content of their own. */
const HARMLESS_WRAPPER_TAGS = new Set(["div", "span"]);

const TAG_NAME_PATTERN = /<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
const SAFE_HREF_PATTERN = /^https?:\/\//i;
const ANCHOR_PATTERN_SOURCE = '<a\\s+[^>]*href="([^"]*)"[^>]*>([\\s\\S]*?)<\\/a>';
const WRAPPER_OPEN_TAG_PATTERN = /<(div|span)(\s+[^>]*)?>/gi;
const EMPTY_TAG_PATTERN = /<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>\s*<\/\1>/i;
const ENTITY_PATTERN = /&(nbsp|amp|lt|gt|quot|#39|apos);/i;
const NON_CANONICAL_BR_PATTERN = /<br\s*\/?\s*>/gi;
const BOLD_ITALIC_TAG_PATTERN = /<\/?\s*(b|i)\b[^>]*>/i;

function findDisallowedTags(rawHtml: string): string[] {
  const found = new Set<string>();
  TAG_NAME_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_NAME_PATTERN.exec(rawHtml))) {
    const tag = match[1].toLowerCase();
    if (!ALLOWED_TAGS.includes(tag)) found.add(tag);
  }
  return [...found];
}

/**
 * True if every `<div>`/`<span>` opening tag in the raw field is bare (no
 * attributes). A single attribute anywhere in the field is enough to demote
 * the whole field's wrapper tags from "harmless" (Level A) to "recoverable"
 * (Level B) — conservative on purpose, since attributes are exactly the
 * thing we can't prove is meaningless.
 */
function wrappersAreBare(rawHtml: string): boolean {
  WRAPPER_OPEN_TAG_PATTERN.lastIndex = 0;
  let match: RegExpExecArray | null;
  let sawWrapper = false;
  while ((match = WRAPPER_OPEN_TAG_PATTERN.exec(rawHtml))) {
    sawWrapper = true;
    if (match[2]?.trim()) return false;
  }
  return sawWrapper;
}

/** Unwraps (rather than deletes) any `<a>` whose href isn't http(s): keeps the visible text, drops the link. */
function stripUnsafeLinks(html: string): { html: string; droppedUnsafeLink: boolean } {
  let droppedUnsafeLink = false;
  const pattern = new RegExp(ANCHOR_PATTERN_SOURCE, "gi");
  const cleaned = html.replace(pattern, (full, href: string, inner: string) => {
    if (SAFE_HREF_PATTERN.test(href.trim())) return full;
    droppedUnsafeLink = true;
    return inner;
  });
  return { html: cleaned, droppedUnsafeLink };
}

/** Tag boundaries (opening or closing) that represent a visual break — must become whitespace, not nothing, or adjacent words jam together. */
const BLOCK_BREAK_PATTERN = /<\s*\/?\s*(br|p|li|ul|ol)\b[^>]*>/gi;

/**
 * Decodes the small, fixed set of entities `sanitizeHtml` itself produces
 * when escaping text content (`&`, `<`, `>`, and, for attribute values,
 * `"`/`'`) — never a generic HTML-entity decoder, since this only ever
 * undoes escaping this same pipeline just applied, not arbitrary source markup.
 */
function decodeTextEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripToPlainText(html: string): string {
  const withBreaks = html.replace(BLOCK_BREAK_PATTERN, " ");
  // sanitizeHtml with allowedTags: [] still produces HTML-SAFE text, not
  // literal plain text — a source cell containing a bare "&" (very common:
  // "Flashing & trim", "cracks & settling") comes back as "&amp;" unless
  // decoded here. Without this, plainText — meant to be the verbatim
  // customer text — silently corrupts any comment containing one of these
  // characters. Found against a real Spectora export, not a synthetic case.
  const stripped = decodeTextEntities(sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} }));
  return stripped.replace(/\s+/g, " ").trim();
}

function extractAnchorHrefs(html: string): string[] {
  const pattern = new RegExp(ANCHOR_PATTERN_SOURCE, "gi");
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) hrefs.push(match[1]);
  return hrefs;
}

/** `<b>`/`<i>` are allowlisted as input (so the sanitizer doesn't strip them) but standardized to `<strong>`/`<em>` on the way out. */
function normalizeBoldItalicTags(html: string): { html: string; changed: boolean } {
  const next = html.replace(/<(\/?)b\b([^>]*)>/gi, "<$1strong$2>").replace(/<(\/?)i\b([^>]*)>/gi, "<$1em$2>");
  return { html: next, changed: next !== html };
}

/** Removes genuinely empty allowlisted containers (e.g. `<p></p>`) left over after sanitization. Never touches `<br>`, which is inherently empty but meaningful. */
function removeEmptyTags(html: string): { html: string; changed: boolean } {
  let current = html;
  for (;;) {
    const next = current.replace(/<([a-zA-Z][a-zA-Z0-9]*)(\s[^>]*)?>\s*<\/\1>/gi, (full, tag: string) =>
      tag.toLowerCase() === "br" ? full : ""
    );
    if (next === current) return { html: current, changed: current !== html };
    current = next;
  }
}

export interface NormalizationEventInput {
  type: NormalizationEventType;
  description: string;
  beforeHash: string;
  afterHash: string;
}

/**
 * Detects which Level-A transforms actually fired for this field, purely for
 * the internal audit trail (docs/architecture.md §5a). This never decides
 * WHAT gets normalized — that's `processRichContent` below — it only
 * explains, after the fact, what changed and why, so "silent" never means
 * "unaccountable."
 */
function detectNormalizationEvents(
  rawHtml: string,
  harmlessWrapperTags: string[],
  finalPlainText: string,
  finalSafeHtml: string,
  safeLinkCount: number
): NormalizationEventInput[] {
  const events: NormalizationEventInput[] = [];
  const beforeHash = sha256Hex(rawHtml);
  const afterHash = sha256Hex(`${finalPlainText}|${finalSafeHtml}`);
  const push = (type: NormalizationEventType, description: string) =>
    events.push({ type, description, beforeHash, afterHash });

  if (rawHtml !== rawHtml.trim()) {
    push("whitespace_trimmed", "Removed leading/trailing whitespace.");
  }
  if (/[ \t]{2,}/.test(rawHtml) || /(&nbsp;){2,}/i.test(rawHtml)) {
    push("duplicate_whitespace_collapsed", "Collapsed repeated whitespace into single spaces.");
  }
  if (EMPTY_TAG_PATTERN.test(rawHtml)) {
    push("empty_tag_removed", "Removed an empty HTML tag with no text content.");
  }
  if (harmlessWrapperTags.length > 0) {
    push(
      "harmless_wrapper_removed",
      `Removed attribute-free wrapper tag(s) (${harmlessWrapperTags.join(", ")}) with no effect on content.`
    );
  }
  NON_CANONICAL_BR_PATTERN.lastIndex = 0;
  if (NON_CANONICAL_BR_PATTERN.test(rawHtml) && !/<br>/.test(rawHtml)) {
    push("line_break_normalized", "Normalized a line break into the editor's supported representation.");
  }
  if (ENTITY_PATTERN.test(rawHtml)) {
    push("html_entity_decoded", "Decoded standard HTML entities (e.g. &nbsp;, &amp;) to their literal characters.");
  }
  if (BOLD_ITALIC_TAG_PATTERN.test(rawHtml)) {
    push("formatting_normalized", "Normalized formatting to the editor's canonical tags (b → strong, i → em).");
  }
  if (safeLinkCount > 0) {
    push("safe_link_normalized", "Enforced rel=\"noopener noreferrer\" and target=\"_blank\" on a safe link; text and destination unchanged.");
  }

  return events;
}

export interface FixSafelyProposal {
  proposedPlainText: string;
  proposedSafeHtml: string | null;
}

export interface RichContentResult {
  /** What's actually persisted. Withheld (empty) when a Level-B fix is pending — plainText is never withheld either way. */
  safeHtml: string;
  /** Always the verbatim, fully preserved text — never withheld, regardless of level. */
  plainText: string;
  links: LinkMetadata[];
  /** Level C tag names only — real, unsupported markup outside the allowlist that still needs a human's attention. */
  disallowedTags: string[];
  /** True if a link was present but its href scheme wasn't http(s). */
  droppedUnsafeLink: boolean;
  /**
   * True if a link survived sanitization but its href value came out
   * different from the source (beyond routine entity encoding). Under the
   * current allowlist config this should never actually trigger — no
   * stage here rewrites hrefs — but it's a real, tested safety net per
   * "detect removed/changed links," not just a removed-link check.
   */
  hadChangedLink: boolean;
  /** Level A audit trail — never surfaced as a warning, see docs/architecture.md §5a. */
  normalizationEvents: NormalizationEventInput[];
  /**
   * Level B — set only when the field's ONLY problem is an attribute-bearing
   * div/span wrapper (no other disallowed markup). The proposal is exactly
   * what `disallowedTags`-driven sanitization would already produce; holding
   * it here instead of applying it is what keeps the change opt-in.
   */
  fixSafely: FixSafelyProposal | null;
}

export function processRichContent(rawHtml: string): RichContentResult {
  const allDisallowedTags = findDisallowedTags(rawHtml);
  const wrapperTagsPresent = allDisallowedTags.filter((tag) => HARMLESS_WRAPPER_TAGS.has(tag));
  const trueDisallowedTags = allDisallowedTags.filter((tag) => !HARMLESS_WRAPPER_TAGS.has(tag));
  const bareWrappers = wrapperTagsPresent.length > 0 && trueDisallowedTags.length === 0 && wrappersAreBare(rawHtml);
  const recoverableWrappers = wrapperTagsPresent.length > 0 && trueDisallowedTags.length === 0 && !bareWrappers;

  const { html: linkSafeHtml, droppedUnsafeLink } = stripUnsafeLinks(rawHtml);
  const rawSafeHrefs = extractAnchorHrefs(linkSafeHtml);

  const sanitized = sanitizeHtml(linkSafeHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });
  const { html: boldItalicNormalized } = normalizeBoldItalicTags(sanitized);
  const { html: fullyCleanedHtml } = removeEmptyTags(boldItalicNormalized);

  const links: LinkMetadata[] = [];
  const extractPattern = new RegExp(ANCHOR_PATTERN_SOURCE, "gi");
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = extractPattern.exec(fullyCleanedHtml))) {
    links.push({ href: linkMatch[1], text: stripToPlainText(linkMatch[2]) });
  }

  const hadChangedLink = rawSafeHrefs.some((rawHref, index) => {
    const finalHref = links[index]?.href;
    return finalHref !== undefined && decodeTextEntities(rawHref.trim()) !== decodeTextEntities(finalHref.trim());
  });

  const plainText = stripToPlainText(linkSafeHtml);

  // Level B: withhold the cleaned rich HTML until a human confirms it via
  // "Fix Safely" — plainText above is unaffected either way, so no wording is
  // ever at risk while a fix is pending.
  const safeHtml = recoverableWrappers ? "" : fullyCleanedHtml;
  const fixSafely: FixSafelyProposal | null = recoverableWrappers
    ? { proposedPlainText: plainText, proposedSafeHtml: fullyCleanedHtml || null }
    : null;

  const normalizationEvents = detectNormalizationEvents(
    rawHtml,
    bareWrappers ? wrapperTagsPresent : [],
    plainText,
    safeHtml,
    droppedUnsafeLink ? 0 : links.length
  );

  return {
    safeHtml,
    plainText,
    links,
    disallowedTags: trueDisallowedTags,
    droppedUnsafeLink,
    hadChangedLink,
    normalizationEvents,
    fixSafely,
  };
}
