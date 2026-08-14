import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import {
  SpecListing,
  specDocumentKey,
  type SpecDocumentContents,
} from '@/components/agents/spec-listing';
import type { Spec } from '@/lib/api/types';

/**
 * Coverage for the spec ledger (AC-8, PC-13).
 *
 * The ledger discloses spec documents whose text is fetched from the API and is
 * therefore untrusted, so the load-bearing assertion is the inert-payload one:
 * a document body carrying a `<script>` tag must reach the DOM as visible
 * literal text and never as an element. The rest of the suite pins the shape
 * the page depends on — a native `<details>`/`<summary>` per document so the
 * route ships no client JavaScript, the "content unavailable" fallback for a
 * document the page could not fetch, and both zero-data fallbacks.
 */

/** The literal payload asserted to render inert (RISK-004). */
const INERT_PAYLOAD = '<script>alert(1)</script>';

/** A listing covering a multi-document spec and a spec with no documents. */
const specs: Spec[] = [
  {
    id: 'SPEC-002',
    display_name: 'The public read API',
    description:
      'CV, articles, projects, agents and specs over one Go service.',
    documents: [
      {
        document_id: 'doc-spec-002',
        filename: 'SPEC-002.md',
        document_type: 'spec',
      },
      {
        document_id: 'doc-acceptance-002',
        filename: 'SPEC-002-acceptance.md',
        document_type: 'acceptance',
      },
      {
        document_id: 'doc-notes-002',
        filename: 'notes.txt',
        document_type: 'other',
      },
    ],
  },
  {
    id: 'SPEC-003',
    display_name: 'The user interface',
    description:
      'This site: routes, rendering strategy and the client boundary.',
    documents: [],
  },
];

/**
 * The longest identifier the ledger must contain, at 32 characters (AC-8).
 *
 * It is the length the column has to survive without truncating, so the tests
 * assert against this exact string rather than a shortened stand-in.
 */
const LONG_IDENTIFIER = 'SPEC-003-REVISION-1-LEDGER-WIDTH';

/** A single-spec listing whose identifier is {@link LONG_IDENTIFIER}. */
const longIdentifierSpecs: Spec[] = [
  {
    id: LONG_IDENTIFIER,
    display_name: 'The ledger column width',
    description: 'A spec whose identifier fills the identifier column exactly.',
    documents: [],
  },
];

/** Contents keyed as the page keys them; `doc-notes-002` failed to load. */
const contents: SpecDocumentContents = {
  [specDocumentKey('SPEC-002', 'doc-spec-002')]: {
    status: 'loaded',
    content: `# Spec statement\n\n${INERT_PAYLOAD}`,
  },
  [specDocumentKey('SPEC-002', 'doc-acceptance-002')]: {
    status: 'loaded',
    content: 'AC-1: every list endpoint returns 200 with an empty collection.',
  },
  [specDocumentKey('SPEC-002', 'doc-notes-002')]: { status: 'failed' },
};

/**
 * specRow returns the ledger row of the given spec display name.
 *
 * @param displayName - the display name heading the row.
 * @returns the row element, so assertions are scoped to a single spec.
 */
function specRow(displayName: string): HTMLElement {
  return screen.getByRole('listitem', { name: displayName });
}

describe('SpecListing', () => {
  it('renders every spec of the listing with its name and description', () => {
    render(<SpecListing specs={specs} contents={contents} />);

    expect(screen.getAllByRole('listitem')).toHaveLength(specs.length);
    for (const spec of specs) {
      const row = specRow(spec.display_name);

      expect(within(row).getByText(spec.display_name)).toBeInTheDocument();
      expect(within(row).getByText(spec.description)).toBeInTheDocument();
    }
  });

  it('renders every document, acceptance included, in a native details element', () => {
    const { container } = render(
      <SpecListing specs={specs} contents={contents} />,
    );
    const row = specRow('The public read API');

    const disclosures = row.querySelectorAll('details');
    expect(disclosures).toHaveLength(3);
    for (const disclosure of disclosures) {
      expect(disclosure.querySelector('summary')).not.toBeNull();
    }
    expect(container.querySelectorAll('details')).toHaveLength(3);

    for (const document_ of specs[0].documents) {
      expect(within(row).getByText(document_.filename)).toBeInTheDocument();
    }
    expect(within(row).getByText('acceptance')).toBeInTheDocument();
  });

  it('renders script-bearing document content as inert literal text', () => {
    const { container } = render(
      <SpecListing specs={specs} contents={contents} />,
    );

    const bodies = [...container.querySelectorAll('pre')].map(
      (body) => body.textContent ?? '',
    );
    expect(bodies.some((body) => body.includes(INERT_PAYLOAD))).toBe(true);
    expect(container.querySelector('script')).toBeNull();
    expect(container.innerHTML).not.toContain('<script>');
  });

  it('renders the fallback disclosure for a document that failed to load', () => {
    render(<SpecListing specs={specs} contents={contents} />);
    const row = specRow('The public read API');

    expect(within(row).getByText('Content unavailable')).toBeInTheDocument();
  });

  it('states that a spec carries no documents rather than rendering nothing', () => {
    render(<SpecListing specs={specs} contents={contents} />);
    const row = specRow('The user interface');

    expect(row.querySelectorAll('details')).toHaveLength(0);
    expect(within(row).getByText('No documents published')).toBeInTheDocument();
  });

  it('renders the fallback disclosure for a document with no supplied content', () => {
    render(<SpecListing specs={specs} contents={{}} />);
    const row = specRow('The public read API');

    expect(within(row).getAllByText('Content unavailable')).toHaveLength(3);
  });

  it('renders an empty state when the listing carries no specs', () => {
    render(<SpecListing specs={[]} contents={{}} />);

    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.getByText('No specs published yet')).toBeInTheDocument();
  });

  it('renders a 32-character identifier as one exact, unsplit text node', () => {
    expect(LONG_IDENTIFIER).toHaveLength(32);
    render(<SpecListing specs={longIdentifierSpecs} contents={{}} />);
    const row = specRow('The ledger column width');

    const identifier = within(row).getByText(LONG_IDENTIFIER);
    // A single text node is what makes the identifier copy as one value: any
    // <wbr>, soft hyphen or zero-width space injected to force a line break
    // would ride along into the clipboard (AC-18).
    expect(identifier.childNodes).toHaveLength(1);
    expect(identifier.firstChild?.nodeType).toBe(Node.TEXT_NODE);
    expect(identifier.textContent).toBe(LONG_IDENTIFIER);
    expect(identifier.querySelector('wbr')).toBeNull();
    expect(identifier.innerHTML).toBe(LONG_IDENTIFIER);
  });

  it('contains the identifier by wrapping rather than truncating it', () => {
    render(<SpecListing specs={longIdentifierSpecs} contents={{}} />);
    const row = specRow('The ledger column width');
    const identifier = within(row).getByText(LONG_IDENTIFIER);

    // minmax(0,…) is what lets the track shrink below the identifier's
    // min-content width; a bare 220px track cannot, and the text overflows.
    expect(row.className).toContain('md:grid-cols-[minmax(0,220px)_1fr]');
    expect(identifier.className).toContain('wrap-anywhere');
    expect(identifier.className).toContain('font-mono');
    expect(identifier.className).toContain('text-xs');
    expect(identifier.className).toContain('leading-normal');
    expect(identifier.className).toContain('pl-(--space-3)');
    expect(identifier.className).toContain(
      'shadow-[inset_2px_0_0_0_var(--color-accent-text)]',
    );
    expect(identifier.className).not.toMatch(
      /truncate|text-ellipsis|line-clamp/,
    );
    expect(identifier).not.toHaveAttribute('title');
  });

  it('is a server component that carries no client directive', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'components/agents/spec-listing.tsx'),
      'utf8',
    );

    expect(source).not.toContain('use client');
    expect(source).not.toContain('dangerouslySetInnerHTML');
  });
});
