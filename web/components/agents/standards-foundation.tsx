import { Badge } from '@/components/ui/badge';
import { SectionHeading } from '@/components/ui/section-heading';

/** One illustrative entry of the standards index. */
type IndexEntry = {
  /** Path of the standards document within the standards repository. */
  path: string;
  /** How the index gates the document: a file-scope glob or a topic. */
  selector: string;
  /** Whether the selector is a `scope` glob or a `topics` term. */
  kind: 'scope' | 'topic';
  /** One sentence on what the document governs and why this task loads it. */
  description: string;
};

/**
 * The slice of the standards index a task on this codebase actually resolves
 * (REQ-2.3, foundation two).
 *
 * The entries are illustrative but not invented: they are the shape of the
 * real index — standards documents gated by file-scope globs and by topic
 * terms, children extending their parents. The figure shows the resolution a
 * task writing TypeScript in this repository would make, so the narrative
 * around it can point at concrete rows instead of describing an abstraction.
 */
const INDEX_WALK: readonly IndexEntry[] = [
  {
    path: 'GENERAL.md',
    selector: '*',
    kind: 'scope',
    description:
      'The cross-language ground rules every task loads: keep it simple, prefer the solution with the least entropy, and put architectural decisions in front of a person before building them.',
  },
  {
    path: 'javascript/GENERAL.md',
    selector: '*.ts',
    kind: 'scope',
    description:
      'How code in this language is written — naming, documentation comments on every function, and components over repetition. Matched because the task’s write set contains TypeScript files.',
  },
  {
    path: 'general/LOGGING.md',
    selector: 'logging',
    kind: 'topic',
    description:
      'The structured log record every service emits. Matched by topic, not by file extension: it applies only when the task actually touches logging, so unrelated work never pays for it.',
  },
];

/**
 * StandardsFoundation renders the second act of the agents narrative: the
 * indexed coding standards that tell agents how to write what the spec asked
 * for (REQ-2.3, foundation two).
 *
 * The content is authored rather than fetched — the standards live in their
 * own repository, outside this site's API — so the section carries the account
 * and a static figure of the index resolution instead of a live listing. The
 * figure reuses the spec ledger's grammar (mono path in a fixed column,
 * hairline-ruled rows) so evidence looks the same in every act.
 *
 * It is a Server Component with no client boundary, so `/agents` still ships
 * zero client JavaScript, and it carries the `foundation-standards` anchor the
 * intro's outline links to.
 *
 * @returns the standards foundation section element.
 */
export function StandardsFoundation() {
  return (
    <section
      id="foundation-standards"
      aria-labelledby="foundation-standards-heading"
      data-slot="standards-foundation"
    >
      <SectionHeading
        id="foundation-standards-heading"
        eyebrow="Foundation 02 · How to do it"
        heading="Indexed standards tell agents how to do it"
        lede="A spec never says how the code should be written — repeated in every spec, that would drift. The how lives in a separate standards repository: numbered statements, each tagged MUST or SHOULD and carrying an identifier like [GO-018], organised into documents and indexed by a tree keyed on file-scope globs and topic terms. An agent about to write code resolves that tree against its own write set and loads exactly the standards that apply — no fewer, and deliberately no more, so its context holds the rules for the code in front of it rather than rules about code it will never touch."
      />

      <p className="mt-10 text-xs font-semibold tracking-wide text-text-tertiary uppercase">
        One resolution of the index
      </p>
      <ul className="mt-6 flex flex-col">
        {INDEX_WALK.map((entry) => (
          <li
            key={entry.path}
            className="grid gap-6 py-5 shadow-[inset_0_-1px_0_0_var(--color-border-subtle)] last:shadow-none md:grid-cols-[minmax(0,220px)_1fr]"
          >
            <div>
              <p className="pl-(--space-3) font-mono text-xs leading-normal wrap-anywhere text-accent-text shadow-[inset_2px_0_0_0_var(--color-accent-text)]">
                {entry.path}
              </p>
            </div>
            <div>
              <div className="flex items-baseline gap-3">
                <Badge>
                  {entry.kind === 'scope' ? 'scope' : 'topic'}{' '}
                  <span className="font-mono">{entry.selector}</span>
                </Badge>
              </div>
              <p className="mt-2 max-w-(--measure-lede) text-sm text-text-secondary">
                {entry.description}
              </p>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-8 max-w-(--measure-lede) text-base text-text-secondary">
        The same index is read twice. The executing agent resolves it before
        writing a line, so the standards shape the code as it is written; the
        quality controller resolves it again over the finished changeset and
        checks nothing else. A violation comes back citing the statement it
        breaks — an identifier, not an opinion — and becomes a remediation task
        that goes through execution like any other work. How the code is written
        is never the reviewing agent&apos;s taste: the document that prescribed
        the code is the one it is judged against.
      </p>
    </section>
  );
}
