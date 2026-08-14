/**
 * Committed site configuration: the personal details and links that the
 * masthead, the footer and the agents page render.
 *
 * The values live in source, not in the environment — this module reads no
 * environment variable and performs no I/O, so a server render and its client
 * hydration always agree and a deployment cannot silently change who the site
 * says it belongs to.
 *
 * ───────────────────────────────────────────────────────────────────────────
 * OUTSTANDING USER INPUT — MUST BE REPLACED BEFORE THE SITE IS PUBLISHED
 *
 * One value is still owed by the site owner and is committed here as a
 * deliberately unmistakable placeholder so that the dependent work is not
 * blocked:
 *
 *   - `agentsRepositoryUrl`  (SPEC-003 REQ-3.5) — deliberately `null`
 *
 * It is NOT a plausible value: the URL is null, so every consumer must handle
 * its absence (the agents page omits the GitHub link rather than rendering a
 * dead one). No value here is derived from the DES-001 mockup, whose phone
 * number, location string and `github.com/...` URLs are design placeholders —
 * `githubUrl` below is the site owner's own profile, taken from this
 * repository's `origin` remote rather than guessed.
 * ───────────────────────────────────────────────────────────────────────────
 */

/** A single entry in the header and footer navigation. */
export interface NavigationEntry {
  /** Application-relative route, always rooted at `/`. */
  readonly href: string;
  /** Text rendered for the link. */
  readonly label: string;
}

/** The shape of the committed site configuration. */
export interface SiteConfig {
  /** Full name shown in the masthead and the wordmark. */
  readonly name: string;
  /** Contact address shown in the contact rail and the footer. */
  readonly email: string;
  /** Contact telephone number shown in the contact rail. */
  readonly phone: string;
  /**
   * Public GitHub profile of the site owner, shown in the masthead contact
   * rail beside the email address and telephone number.
   */
  readonly githubUrl: string;
  /** One-sentence summary rendered as the masthead lede. */
  readonly headline: string;
  /**
   * Public GitHub URL of the agents repository, or `null` when no URL is
   * available. Consumers must branch on the null case and omit the link
   * entirely; they must never render a placeholder or guessed href.
   */
  readonly agentsRepositoryUrl: string | null;
  /** Header and footer navigation, in display order. */
  readonly navigation: readonly NavigationEntry[];
}

/** The telephone number supplied by the site owner. */
const PHONE = '+ 1 (512) 271 8087';

/**
 * The site owner's GitHub profile (SPEC-003 remediation). Derived from this
 * repository's `origin` remote — `git@github.com:PSauerborn/personal-website`
 * — so it is the owner's real account rather than the `github.com/...` string
 * the DES-001 mockup carries as a design placeholder.
 */
const GITHUB_URL = 'https://github.com/PSauerborn';

/**
 * The masthead lede (SPEC-003 REQ-2.1). Sourced from the owner's CV
 * (docs/specs/external-docs/PSauerborn CV.pdf); every claim in it is
 * substantiated there — years of experience, the spec-driven agentic pipeline
 * work, and the data categories: 3M+ electronic health records and sequenced
 * genomic data under GDPR at Omnigen Biodata, and on-premise energy-sector
 * deployments under strict data governance at Uniper Technologies.
 */
const HEADLINE =
  'I make agentic development production-grade — designing spec-driven ' +
  'pipelines where AI subagents plan, implement, and review software with ' +
  'the rigor of 7+ years building platforms trusted with health records, ' +
  'genomic data, and critical infrastructure.';

/** The committed configuration. Frozen: nothing may mutate it at runtime. */
export const siteConfig: SiteConfig = Object.freeze({
  name: 'Pascal Sauerborn',
  email: 'pascal.sauerborn@gmail.com',
  phone: PHONE,
  githubUrl: GITHUB_URL,
  headline: HEADLINE,
  agentsRepositoryUrl: null,
  navigation: Object.freeze([
    Object.freeze({ href: '/', label: 'Home' }),
    Object.freeze({ href: '/agents', label: 'Agents' }),
    Object.freeze({ href: '/blog', label: 'Writing' }),
    Object.freeze({ href: '/projects', label: 'Projects' }),
  ]),
});
