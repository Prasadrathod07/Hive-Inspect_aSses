import sanitizeHtml from "sanitize-html";
import type { LinkMetadata } from "./types";

/**
 * Stage 5 (docs/architecture.md §2.5, §5): the sanitizer allowlist and link
 * policy. Anything outside the allowlist is stripped from safeHtml but the
 * caller is told so it can raise an ImportIssueCandidate — plain text is
 * still preserved regardless (policy: "surrounding text is still preserved,
 * only the disallowed markup is flagged"). For an unsafe link specifically,
 * only the href/link-ness is removed — the link's own visible text is
 * customer content too and is kept, just no longer clickable.
 */
const ALLOWED_TAGS = ["b", "strong", "i", "em", "u", "br", "p", "ul", "ol", "li", "a"];
const ALLOWED_ATTRIBUTES: Record<string, string[]> = { a: ["href", "target", "rel"] };

const TAG_NAME_PATTERN = /<\/?\s*([a-zA-Z][a-zA-Z0-9]*)\b[^>]*>/g;
const SAFE_HREF_PATTERN = /^https?:\/\//i;
const ANCHOR_PATTERN_SOURCE = '<a\\s+[^>]*href="([^"]*)"[^>]*>([\\s\\S]*?)<\\/a>';

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

function stripToPlainText(html: string): string {
  const withBreaks = html.replace(BLOCK_BREAK_PATTERN, " ");
  const stripped = sanitizeHtml(withBreaks, { allowedTags: [], allowedAttributes: {} });
  return stripped.replace(/\s+/g, " ").trim();
}

/** Decodes just the entities that can legitimately appear in an attribute value, for href comparison purposes only. */
function decodeHrefEntities(href: string): string {
  return href
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function extractAnchorHrefs(html: string): string[] {
  const pattern = new RegExp(ANCHOR_PATTERN_SOURCE, "gi");
  const hrefs: string[] = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) hrefs.push(match[1]);
  return hrefs;
}

export interface RichContentResult {
  safeHtml: string;
  plainText: string;
  links: LinkMetadata[];
  /** Tag names outside the allowlist that were stripped (empty if none). */
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
}

export function processRichContent(rawHtml: string): RichContentResult {
  const disallowedTags = findDisallowedTags(rawHtml);
  const { html: linkSafeHtml, droppedUnsafeLink } = stripUnsafeLinks(rawHtml);
  const rawSafeHrefs = extractAnchorHrefs(linkSafeHtml);

  const safeHtml = sanitizeHtml(linkSafeHtml, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedSchemes: ["http", "https"],
    transformTags: {
      a: sanitizeHtml.simpleTransform("a", { rel: "noopener noreferrer", target: "_blank" }),
    },
  });

  const links: LinkMetadata[] = [];
  const extractPattern = new RegExp(ANCHOR_PATTERN_SOURCE, "gi");
  let linkMatch: RegExpExecArray | null;
  while ((linkMatch = extractPattern.exec(safeHtml))) {
    links.push({ href: linkMatch[1], text: stripToPlainText(linkMatch[2]) });
  }

  const hadChangedLink = rawSafeHrefs.some((rawHref, index) => {
    const finalHref = links[index]?.href;
    return finalHref !== undefined && decodeHrefEntities(rawHref.trim()) !== decodeHrefEntities(finalHref.trim());
  });

  const plainText = stripToPlainText(linkSafeHtml);

  return { safeHtml, plainText, links, disallowedTags, droppedUnsafeLink, hadChangedLink };
}
