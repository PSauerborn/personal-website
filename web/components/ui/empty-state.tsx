import type { ReactNode } from 'react';

import { cn } from '@/lib/utils';

/** Props accepted by `EmptyState`. */
export type EmptyStateProps = {
  /** Caps signpost naming the surface that has no data, e.g. `Projects`. */
  label: string;
  /** One sentence stating what is missing, e.g. `No projects listed yet`. */
  statement: string;
  /** Optional supporting sentence explaining where to look instead. */
  description?: string;
  /** Optional single call to action, usually a secondary `Button`. */
  action?: ReactNode;
  /** Additional classes merged after the empty-state classes. */
  className?: string;
};

/**
 * EmptyState renders the designed zero-data view shared by the projects
 * ledger, the blog archive, the comment thread and the CV surfaces.
 *
 * The shape is the DES-001 empty state: a 12px caps signpost in the accent
 * colour — the same treatment `SectionHeading` gives a section opener, because
 * this block stands in for one — the statement as the only heading, an
 * optional supporting sentence in tertiary text, and at most one action. It is a ruled panel rather than a card — a hairline ring on
 * the page background — so a zero-data view still reads as part of the
 * document. The supporting sentence is held to the lede measure so it stays
 * readable when it is centred.
 *
 * @param label - caps signpost naming the surface.
 * @param statement - the sentence stating what is missing; rendered as the
 *   heading of the block.
 * @param description - optional supporting sentence.
 * @param action - optional call to action.
 * @param className - additional classes merged after the empty-state classes.
 * @returns the empty-state element.
 */
export function EmptyState({
  label,
  statement,
  description,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      data-slot="empty-state"
      className={cn(
        'flex flex-col items-center gap-3 rounded-xl px-5 py-16 text-center',
        'shadow-(--hairline-soft)',
        className,
      )}
    >
      <p className="text-xs font-semibold tracking-wide text-accent-text uppercase">
        {label}
      </p>
      <h2 className="text-base font-medium text-text-primary">{statement}</h2>
      {description ? (
        <p className="max-w-(--measure-lede) text-sm text-text-tertiary">
          {description}
        </p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
