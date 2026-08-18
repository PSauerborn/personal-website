/**
 * Shared presentation helpers.
 *
 * `formatDate` is the single date formatter of the application. Every timestamp
 * returned by the API is ISO8601 and is rendered from its UTC components with a
 * fixed month table, so the output depends on nothing but the value itself: the
 * ambient `TZ`, the ambient locale and the ICU build of the runtime cannot move
 * it. That is what keeps a server-rendered date and its client hydration
 * byte-identical. A missing or unparseable value renders a caller-chosen
 * fallback, never `null` or `Invalid Date`.
 *
 * `safeExternalHref` is the companion barrier for links: it is the single place
 * an API-supplied URL is checked before it reaches an `href`.
 */

/** Rendered in place of a date that is missing or cannot be parsed. */
export const DATE_FALLBACK = '—';

/** Fixed English month abbreviations, indexed by UTC month number. */
const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/**
 * formatDate renders an ISO8601 timestamp as a fixed `DD Mon YYYY` UTC date.
 *
 * @param value - ISO8601 timestamp from the API, or null/undefined when the
 *   field is nullable or absent.
 * @param fallback - string to render when the value is missing or unparseable;
 *   defaults to `DATE_FALLBACK`. Pass `'Present'` for an open-ended range.
 * @returns the formatted date, or the fallback.
 */
export function formatDate(
  value: string | null | undefined,
  fallback: string = DATE_FALLBACK,
): string {
  if (typeof value !== 'string' || value.trim() === '') {
    return fallback;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  const day = String(parsed.getUTCDate()).padStart(2, '0');
  return `${day} ${MONTHS[parsed.getUTCMonth()]} ${parsed.getUTCFullYear()}`;
}

/** URL schemes that may appear in an `href` rendered from API-supplied data. */
const SAFE_HREF_PROTOCOLS = ['http:', 'https:'];

/**
 * safeExternalHref narrows an API-supplied link to one that is safe to place in
 * an `href`.
 *
 * The projects ledger renders `primary_link` and `github_link` straight from
 * `GET /v1/projects/list`. React does not block a `javascript:` href — it warns
 * and renders it — so anything able to write those columns could otherwise run
 * script in the site's origin on the next click. This is the same allow-list
 * barrier `ARTICLE_SANITIZE_SCHEMA` applies to markdown links, expressed for
 * values that never pass through the markdown pipeline.
 *
 * Only absolute `http:`/`https:` URLs are accepted. A relative path is rejected
 * as well: these are external destinations, and a caller wanting an internal
 * route should use `next/link` rather than this helper.
 *
 * @param value - candidate URL from the API, or null/undefined when the field
 *   is nullable or absent.
 * @returns the URL unchanged when it parses and carries an allowed scheme, or
 *   `null` otherwise — the caller renders no anchor at all for a `null`.
 */
export function safeExternalHref(
  value: string | null | undefined,
): string | null {
  if (typeof value !== 'string' || value.trim() === '') {
    return null;
  }

  let parsed: URL;
  try {
    // Parsed rather than pattern-matched: the browser normalises whitespace,
    // control characters and letter case before acting on a URL, and `new URL`
    // is the same normalisation rather than a second guess at it.
    parsed = new URL(value);
  } catch {
    return null;
  }

  return SAFE_HREF_PROTOCOLS.includes(parsed.protocol) ? value : null;
}

/** A class name, or a conditional structure that may yield class names. */
export type ClassValue =
  | string
  | number
  | false
  | null
  | undefined
  | ClassValue[]
  | Record<string, boolean | null | undefined>;

/**
 * cn joins conditional class names into a single `class` attribute value,
 * dropping every falsy entry. It accepts the same argument shapes as `clsx`,
 * which is the signature the shadcn primitives are written against.
 *
 * @param values - class names, arrays of them, or `{className: condition}` maps.
 * @returns the applicable class names separated by a single space, or an empty
 *   string when none apply.
 */
export function cn(...values: ClassValue[]): string {
  const classes: string[] = [];

  for (const value of values) {
    if (!value) {
      continue;
    }
    if (typeof value === 'string' || typeof value === 'number') {
      classes.push(String(value));
    } else if (Array.isArray(value)) {
      const nested = cn(...value);
      if (nested) {
        classes.push(nested);
      }
    } else {
      for (const [name, enabled] of Object.entries(value)) {
        if (enabled) {
          classes.push(name);
        }
      }
    }
  }

  return classes.join(' ');
}
