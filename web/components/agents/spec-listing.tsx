import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import type { Spec, SpecDocument } from '@/lib/api/types';

/**
 * The content of one spec document as fetched by the page.
 *
 * A fetch failure is a value rather than an exception: one unreadable document
 * must not remove the rest of the ledger from the page, so the page records the
 * failure and this component discloses it.
 */
export type SpecDocumentContent =
  { status: 'loaded'; content: string } | { status: 'failed' };

/**
 * Document contents keyed by {@link specDocumentKey}.
 *
 * Document identifiers are only unique within their spec, so the key carries
 * the spec identifier as well.
 */
export type SpecDocumentContents = Record<string, SpecDocumentContent>;

/**
 * specDocumentKey builds the {@link SpecDocumentContents} key of one document.
 *
 * It is exported so the page fetching the contents and this component agree on
 * the key without either restating the format.
 *
 * @param specId - identifier of the spec owning the document.
 * @param documentId - identifier of the document within that spec.
 * @returns the map key of the document content.
 */
export function specDocumentKey(specId: string, documentId: string): string {
  return `${specId}/${documentId}`;
}

/** Line shown for a spec whose disclosable document set is empty. */
const NO_DOCUMENTS = 'No documents published';

/** Line shown in place of a document body the page could not fetch. */
const UNAVAILABLE = 'Content unavailable';

/** Props accepted by `SpecDocumentDisclosure`. */
type SpecDocumentDisclosureProps = {
  /** The document being disclosed. */
  document: SpecDocument;
  /** Its fetched content, or `undefined` when the page supplied none. */
  content: SpecDocumentContent | undefined;
};

/**
 * SpecDocumentDisclosure renders one document as a native `<details>` block.
 *
 * The disclosure is the browser's own `<details>`/`<summary>` pair rather than
 * a state-driven panel, which is what lets the agents page ship zero client
 * JavaScript and keeps the document readable with scripting disabled.
 *
 * The body is rendered as preformatted text with plain string children: React
 * escapes it, so a document carrying `<script>` markup reaches the page as
 * visible literal text and never as an element (RISK-004). No raw-HTML
 * injection path of any kind exists in this file.
 *
 * @param document - the document being disclosed.
 * @param content - its fetched content; a failed or missing entry renders the
 *   unavailable line instead of throwing.
 * @returns the disclosure element.
 */
function SpecDocumentDisclosure({
  document,
  content,
}: SpecDocumentDisclosureProps) {
  return (
    <details className="group py-3 shadow-[inset_0_-1px_0_0_var(--color-border-subtle)] last:shadow-none">
      <summary className="flex cursor-pointer list-none items-baseline gap-3 [&::-webkit-details-marker]:hidden">
        <span className="font-mono text-sm text-accent-text">
          {document.filename}
        </span>
        <Badge>{document.document_type}</Badge>
        <span className="ml-auto text-xs text-text-tertiary transition-transform duration-(--duration-fast) group-open:rotate-180">
          ▾
        </span>
      </summary>
      {content?.status === 'loaded' ? (
        <pre className="mt-3 max-h-96 overflow-auto rounded-xl bg-surface-active p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-text-secondary shadow-(--hairline-soft)">
          {content.content}
        </pre>
      ) : (
        <p className="mt-3 text-sm text-text-tertiary">{UNAVAILABLE}</p>
      )}
    </details>
  );
}

/** Props accepted by `SpecListing`. */
export type SpecListingProps = {
  /** Every disclosable spec, fetched by the page (`GET /v1/agents/specs`). */
  specs: Spec[];
  /** Document contents already fetched by the page, keyed by document. */
  contents: SpecDocumentContents;
};

/**
 * SpecListing renders the ledger of specs this site was built from.
 *
 * Each spec occupies one hairline-ruled row of the DES-001 ledger — the spec
 * identifier in mono, its display name and description, and one native
 * `<details>` disclosure per published document, acceptance documents included.
 * The component is a Server Component and fetches nothing itself: contents are
 * handed to it by the page so a single unreadable document degrades to a line
 * of text rather than an error page.
 *
 * The identifier column is a `minmax(0,220px)` track rather than a fixed
 * `220px` one: only the former may shrink below the identifier's min-content
 * width, which is what stops a 32-character identifier from overflowing the
 * column. The identifier itself wraps anywhere and is never truncated, so it
 * stays one text node and copies as the exact identifier; the accent rule
 * inset on its leading edge, not the text colour, carries the wayfinding.
 *
 * @param specs - every disclosable spec, in the order the API returned them.
 * @param contents - document contents keyed by {@link specDocumentKey}.
 * @returns the ledger element, or the designed empty state when there are no
 *   specs to list.
 */
export function SpecListing({ specs, contents }: SpecListingProps) {
  if (specs.length === 0) {
    return (
      <EmptyState
        label="Specs"
        statement="No specs published yet"
        description="The specs this site was built from are published from the agents repository; the ledger fills in as they land."
      />
    );
  }

  return (
    <ul data-slot="spec-listing" className="flex flex-col">
      {specs.map((spec) => {
        const nameId = `spec-${spec.id}-name`;

        return (
          <li
            key={spec.id}
            aria-labelledby={nameId}
            className="grid gap-6 py-6 shadow-[inset_0_-1px_0_0_var(--color-border-subtle)] last:shadow-none md:grid-cols-[minmax(0,220px)_1fr]"
          >
            <div>
              <p className="pl-(--space-3) font-mono text-xs leading-normal wrap-anywhere text-accent-text shadow-[inset_2px_0_0_0_var(--color-accent-text)]">
                {spec.id}
              </p>
            </div>
            <div>
              <h3
                id={nameId}
                className="text-base font-medium text-text-primary"
              >
                {spec.display_name}
              </h3>
              <p className="mt-1 max-w-(--measure-lede) text-sm text-text-secondary">
                {spec.description}
              </p>
              {spec.documents.length === 0 ? (
                <p className="mt-4 text-sm text-text-tertiary">
                  {NO_DOCUMENTS}
                </p>
              ) : (
                <div className="mt-4 flex flex-col">
                  {spec.documents.map((document) => (
                    <SpecDocumentDisclosure
                      key={document.document_id}
                      document={document}
                      content={
                        contents[specDocumentKey(spec.id, document.document_id)]
                      }
                    />
                  ))}
                </div>
              )}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
