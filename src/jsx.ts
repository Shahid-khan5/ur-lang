// JSX rules shared by the lexer, checker, codegen, and formatter. Kept in one
// place so the "is this a component?" question and text handling can never
// drift apart between the type checker and what we emit.

/**
 * Intrinsic = emitted as a string tag (`_jsx("div", …)`); otherwise the tag is
 * a value reference (`_jsx(Foo.Bar, …)`). Same rule as JSX everywhere: a
 * lowercase or dashed *plain* name is intrinsic, and any dotted name is a
 * member expression, so `<foo.Bar/>` is a component despite the lowercase head.
 */
export function isIntrinsicTag(tagName: string): boolean {
  if (tagName.includes(".")) return false;
  return /^[a-z]/.test(tagName) || tagName.includes("-");
}

/**
 * `key` is consumed by the JSX runtime (passed as the element key, not in
 * props), so it is never checked against — or required by — a component's
 * props type.
 */
export const RESERVED_JSX_ATTRS: ReadonlySet<string> = new Set(["key"]);

/**
 * Cleans JSX text the way Babel does: whitespace lines that only exist for
 * indentation disappear, and the remaining lines join with a single space.
 * Interior spacing on a single line is preserved.
 */
export function cleanJsxText(raw: string): string {
  const lines = raw.split("\n");
  const kept: string[] = [];
  for (let idx = 0; idx < lines.length; idx++) {
    let line = lines[idx]!;
    if (idx !== 0) line = line.replace(/^[ \t\r]+/, "");
    if (idx !== lines.length - 1) line = line.replace(/[ \t\r]+$/, "");
    if (line !== "") kept.push(line);
  }
  return kept.join(" ");
}

// The named entities JSX text realistically uses; numeric references are
// handled generically below. Shipping HTML5's full 2000-name table isn't worth
// the bytes — anything unlisted is left verbatim, which is also what JSX does
// for an unknown entity.
const NAMED_ENTITIES: ReadonlyMap<string, string> = new Map([
  ["amp", "&"],
  ["lt", "<"],
  ["gt", ">"],
  ["quot", '"'],
  ["apos", "'"],
  ["nbsp", " "],
  ["copy", "©"],
  ["reg", "®"],
  ["hellip", "…"],
  ["mdash", "—"],
  ["ndash", "–"],
  ["times", "×"],
  ["lsquo", "‘"],
  ["rsquo", "’"],
  ["ldquo", "“"],
  ["rdquo", "”"],
]);

/**
 * Decodes HTML entities in JSX text and attribute strings — `&nbsp;` has to
 * become a real non-breaking space, not six literal characters.
 */
export function decodeJsxEntities(raw: string): string {
  if (!raw.includes("&")) return raw; // fast path: the overwhelming majority
  return raw.replace(/&(#[xX][0-9a-fA-F]+|#[0-9]+|[a-zA-Z][a-zA-Z0-9]*);/g, (match, body: string) => {
    if (body.startsWith("#")) {
      const hex = body[1] === "x" || body[1] === "X";
      const code = Number.parseInt(hex ? body.slice(2) : body.slice(1), hex ? 16 : 10);
      // Code points past Unicode's range would throw; leave those as written.
      if (Number.isNaN(code) || code > 0x10ffff) return match;
      return String.fromCodePoint(code);
    }
    return NAMED_ENTITIES.get(body) ?? match;
  });
}
