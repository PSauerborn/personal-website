import Link from 'next/link';

import { SectionHeading } from '@/components/ui/section-heading';

/** One numbered row of the summary. */
type SummaryPoint = {
  /** Two-digit ordinal shown in the numeral column. */
  ordinal: string;
  /** Short title naming the practice. */
  title: string;
  /** One or two sentences describing how the practice works in this repository. */
  description: string;
};

/**
 * The three practices REQ-2.3 requires the homepage to summarise, in the order
 * they run: the spec and its acceptance criteria come first, the standards an
 * agent loads while writing the code second, and the orchestration that carries
 * a change through both third.
 */
const SUMMARY_POINTS: readonly SummaryPoint[] = [
  {
    ordinal: '01',
    title: 'Spec-driven, acceptance-criteria first',
    description:
      'Specs tell agents what to do. Every change starts as a numbered requirement in a spec, mapped to Gherkin acceptance criteria before any code is written. The criteria are the definition of done and provide agents with a clear mechanism for determining when a task is implemented correctly.',
  },
  {
    ordinal: '02',
    title: 'Indexed coding standards',
    description:
      'Coding standards tell agents how to do it. Comprehensive coding standards indexed by file scope and topic ensure that agents that code and review know exactly how I like things done — critical to achieving consistent quality.',
  },
  {
    ordinal: '03',
    title: 'Subagent orchestration',
    description:
      'Orchestration manages the whole process end to end. Planning, TDD execution, quality control, security and risk review are separate subagents with separate contracts. Each stage hands the next a written document rather than a conversation, producing an auditable development cycle that can be reviewed at multiple stages.',
  },
];

/**
 * AgenticSummary renders the homepage section summarising how this site is
 * built (REQ-2.3): three numbered rows covering acceptance-criteria-driven spec
 * development, indexed coding standards and subagent orchestration, followed by
 * a link to the full dossier on `/agents`. The hiring call to action lives in
 * the contact section's lede, not here, so this list closes on its own terms.
 *
 * The section follows the DES-001 numbered-row treatment — a caps signpost, one
 * section heading, and rows divided by hairline rules with the ordinal set in
 * tertiary text. There are no cards and no third weight: rank is carried by
 * colour and by the two body weights alone. The closing row repeats the row
 * shape with an empty numeral cell so the link sits on the same grid as the
 * points it follows.
 *
 * @returns the agentic summary section element.
 */
export function AgenticSummary() {
  return (
    <section
      id="agentic-summary"
      aria-labelledby="agentic-summary-heading"
      data-slot="agentic-summary"
    >
      <SectionHeading
        id="agentic-summary-heading"
        eyebrow="Agentic development"
        heading="Written by agents, under a spec"
        lede="I'm a practitioner of spec-driven development. It allows me to focus more on the product, and less on the engineering. Every line of this site started as a numbered requirement. A pipeline of subagents takes it from there, and nothing lands without meeting the acceptance criteria it was written against. These are the foundations of agentic development as I practice it."
      />

      <div className="mt-6">
        {SUMMARY_POINTS.map((point, index) => (
          <div
            key={point.ordinal}
            data-testid={`agentic-summary-point-${index + 1}`}
            className="grid grid-cols-[32px_1fr] gap-5 border-t border-border-subtle py-5"
          >
            <span className="pt-1 text-xs font-semibold text-accent-text">
              {point.ordinal}
            </span>
            <div>
              <h3 className="text-base font-medium text-text-primary">
                {point.title}
              </h3>
              <p className="mt-2 max-w-(--measure-prose) text-sm text-text-secondary">
                {point.description}
              </p>
            </div>
          </div>
        ))}

        <div className="grid grid-cols-[32px_1fr] gap-5 border-y border-border-subtle py-5">
          <span aria-hidden="true" />
          <Link
            href="/agents"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            See my full workflow, agent catalogue, and the specs that built this
            page →
          </Link>
        </div>
      </div>
    </section>
  );
}
