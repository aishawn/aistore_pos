/**
 * Shared formatting for product labels shown to cashiers / planners.
 * Aligns with pos-api AssistantDisplayText: strip import/test noise from
 * Odoo display names while keeping the raw string for tooltips and search.
 *
 * Bracket / prefix stripping uses string scans (not RegExp escapes) so Node
 * --experimental-strip-types used by npm run test:unit cannot mangle patterns.
 */

const LB = String.fromCharCode(91); // [
const RB = String.fromCharCode(93); // ]
const TAB = String.fromCharCode(9);
const LF = String.fromCharCode(10);
const CR = String.fromCharCode(13);
const HYPHEN = String.fromCharCode(45);
const MIDDOT = String.fromCharCode(0xb7);
const EN_DASH = String.fromCharCode(0x2013);
const EM_DASH = String.fromCharCode(0x2014);

function looksLikeSeedTag(left: string): boolean {
  const u = left.toUpperCase();
  return u.includes("TEST") || u.startsWith("R2") || u === "DEMO" || u === "SEED";
}

function isSpace(ch: string): boolean {
  return ch === " " || ch === TAB || ch === LF || ch === CR;
}

function collapseSpaces(value: string): string {
  let out = "";
  let gap = false;
  for (const ch of value) {
    if (isSpace(ch)) {
      gap = true;
      continue;
    }
    if (gap && out) out += " ";
    gap = false;
    out += ch;
  }
  return out.trim();
}

function isIdBodyChar(ch: string): boolean {
  return (ch >= "A" && ch <= "Z")
    || (ch >= "a" && ch <= "z")
    || (ch >= "0" && ch <= "9");
}

/** Strip leading/embedded [R2-…], [SKU-…], [ID-…] tokens (case-insensitive). */
function stripBracketedIds(name: string): string {
  let out = "";
  let i = 0;
  while (i < name.length) {
    if (name[i] !== LB) {
      out += name[i];
      i += 1;
      continue;
    }
    const close = name.indexOf(RB, i + 1);
    if (close < 0) {
      out += name.slice(i);
      break;
    }
    const inner = name.slice(i + 1, close);
    const upper = inner.toUpperCase();
    const isLongHexId = inner.length >= 12 && [...inner].every((ch) =>
      (ch >= "A" && ch <= "F") || (ch >= "a" && ch <= "f") || (ch >= "0" && ch <= "9"),
    );
    const isImportId = (
      (upper.startsWith("R2-") || upper.startsWith("R2_")
        || upper.startsWith("SKU-") || upper.startsWith("SKU_")
        || upper.startsWith("ID-") || upper.startsWith("ID_"))
      && [...inner.slice(inner.indexOf("-") >= 0 ? inner.indexOf("-") + 1 : inner.indexOf("_") + 1)].every(isIdBodyChar)
    );
    if (!isImportId && !isLongHexId) {
      out += name.slice(i, close + 1);
      i = close + 1;
      continue;
    }
    i = close + 1;
    while (i < name.length && isSpace(name[i]!)) i += 1;
  }
  return out;
}

/** Remove long import hashes that appear as a separate token in display names. */
function stripInlineHexIds(name: string): string {
  let out = "";
  let token = "";
  const flush = () => {
    if (token && !(token.length >= 12 && [...token].every((ch) =>
      (ch >= "A" && ch <= "F") || (ch >= "a" && ch <= "f") || (ch >= "0" && ch <= "9"),
    ))) out += token;
    token = "";
  };
  for (const ch of name) {
    if (isIdBodyChar(ch)) token += ch;
    else { flush(); out += ch; }
  }
  flush();
  return out;
}

function stripLeadingPrefix(name: string, matcher: (head: string) => number): string {
  let i = 0;
  while (i < name.length && isSpace(name[i]!)) i += 1;
  const consumed = matcher(name.slice(i));
  if (consumed <= 0) return name;
  const rest = name.slice(i + consumed);
  let j = 0;
  while (j < rest.length && isSpace(rest[j]!)) j += 1;
  return rest.slice(j);
}

function matchTestPrefix(head: string): number {
  // (?:R2 +)?TEST(?: +DATA)? *[|：:] *
  const upper = head.toUpperCase();
  let i = 0;
  if (upper.startsWith("R2")) {
    let j = 2;
    while (j < head.length && isSpace(head[j]!)) j += 1;
    if (j === 2) return 0;
    i = j;
  }
  if (!upper.slice(i).startsWith("TEST")) return 0;
  i += 4;
  let k = i;
  while (k < head.length && isSpace(head[k]!)) k += 1;
  if (upper.slice(k).startsWith("DATA")) {
    i = k + 4;
  }
  while (i < head.length && isSpace(head[i]!)) i += 1;
  const sep = head[i];
  if (sep !== "|" && sep !== "：" && sep !== ":") return 0;
  i += 1;
  while (i < head.length && isSpace(head[i]!)) i += 1;
  return i;
}

function matchDemoPrefix(head: string): number {
  const upper = head.toUpperCase();
  if (!upper.startsWith("DEMO")) return 0;
  // "DEMO Beer" / "DEMO Soft drinks" — drop the DEMO word + following spaces.
  if (head.length > 4 && isSpace(head[4]!)) {
    let i = 4;
    while (i < head.length && isSpace(head[i]!)) i += 1;
    return i > 4 ? i : 0;
  }
  // "DEMO|House Red" / "DEMO · …" / "DEMO - …"
  let i = 4;
  while (i < head.length && isSpace(head[i]!)) i += 1;
  const sep = head[i];
  if (sep !== "|" && sep !== MIDDOT && sep !== HYPHEN && sep !== EN_DASH && sep !== EM_DASH) {
    return 0;
  }
  i += 1;
  while (i < head.length && isSpace(head[i]!)) i += 1;
  return i;
}

type Textish = string | false | null | undefined;

function asText(raw: Textish): string {
  if (raw == null || raw === false) return "";
  return String(raw);
}

/** Human-readable shelf label from an Odoo name / display_name. */
export function friendlyProductName(raw: Textish): string {
  const trimmed = asText(raw).trim();
  if (!trimmed) {
    return "Product";
  }
  let name = trimmed;
  name = stripBracketedIds(name);
  name = stripLeadingPrefix(name, matchTestPrefix);
  name = stripLeadingPrefix(name, matchDemoPrefix);

  const pipe = name.indexOf("|");
  if (pipe >= 0 && pipe < name.length - 1) {
    const left = name.slice(0, pipe).trim();
    const right = name.slice(pipe + 1).trim();
    if (right && (!left || left.length <= 12 || looksLikeSeedTag(left))) {
      name = right;
    }
  }

  name = collapseSpaces(name);
  name = collapseSpaces(stripInlineHexIds(name));
  return name || "Product";
}

/** Short SKU for dense tables; full value stays in title/tooltip. */
export function truncateSku(sku: Textish, maxLen = 12): string {
  const value = asText(sku).trim();
  if (!value) return "";
  if (value.length <= maxLen) return value;
  return `${value.slice(0, Math.max(1, maxLen - 1))}…`;
}

/** True when catalogue rows still carry R2 import markers (demo/TEST packs). */
export function looksLikeR2ImportMarker(nameOrSku: Textish): boolean {
  const value = asText(nameOrSku).trim();
  if (!value) return false;
  const upper = value.toUpperCase();
  if (upper.startsWith("R2-") || upper.startsWith("R2_")) return true;
  if (value.includes(`${LB}R2-`) || value.includes(`${LB}R2_`) || value.toLowerCase().includes(`${LB}r2-`)) {
    return true;
  }
  if (matchTestPrefix(value) > 0) return true;
  if (upper.includes("R2 TEST")) return true;
  return false;
}
