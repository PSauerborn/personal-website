import type { Metadata } from 'next';
import Link from 'next/link';

import { AgentCatalogue } from '@/components/agents/agent-catalogue';
import { AgentWorkflow } from '@/components/agents/agent-workflow';
import {
  SpecListing,
  specDocumentKey,
  type SpecDocumentContents,
} from '@/components/agents/spec-listing';
import { StandardsFoundation } from '@/components/agents/standards-foundation';
import { SectionHeading } from '@/components/ui/section-heading';
import {
  SPEC_DOCUMENT_TIMEOUT_MS,
  getSpecDocument,
  listAgents,
  listSpecs,
} from '@/lib/api/agents';
import type { Spec } from '@/lib/api/types';
import { log } from '@/lib/logger';

/**
 * Metadata of the agents route (REQ-1.9).
 *
 * The description is the page's own summary rather than the site default, so
 * the route is findable on the terms this page is actually about.
 */
export const metadata: Metadata = {
  title: 'Agents',
  description:
    'The agentic development pipeline behind this site, told on its three foundations: the specs that say what to do, the indexed coding standards that say how, and the orchestration that carries a change end to end — with the full subagent catalogue and every spec published in full.',
};

/**
 * Rendering mode of the route (SPEC-003 §6.1).
 *
 * Every route of this site is dynamic: the page reads the API on each request,
 * so there is nothing to prerender at build time and an attempt to do so fails
 * the build — the API base URL is a runtime setting, and the client's own
 * requests are uncached. Declaring the segment `force-dynamic` keeps the route
 * out of the static export and renders it per request.
 */
export const dynamic = 'force-dynamic';

/** One entry of the intro's foundation list, linking to the act that tells it. */
type Foundation = {
  /** Two-digit ordinal, matching the homepage summary's numbering. */
  ordinal: string;
  /** The foundation, stated the way the homepage states it. */
  title: string;
  /** One line naming the evidence the act below carries for it. */
  evidence: string;
  /** Fragment identifier of the section telling this part of the story. */
  anchor: string;
};

/**
 * The three foundations of the homepage summary (REQ-2.3), restated here as
 * the outline of the page: each entry names the act below that tells it and
 * the evidence that act carries. The ordinals and titles deliberately mirror
 * the homepage rows, so a visitor arriving from there lands in the same frame
 * they left.
 */
const FOUNDATIONS: readonly Foundation[] = [
  {
    ordinal: '01',
    title: 'Specs tell agents what to do',
    evidence:
      'Every spec this site was built from, published in full — acceptance criteria included.',
    anchor: 'foundation-specs',
  },
  {
    ordinal: '02',
    title: 'Indexed standards tell agents how',
    evidence:
      'The standards index agents resolve against their write set before writing or reviewing a line.',
    anchor: 'foundation-standards',
  },
  {
    ordinal: '03',
    title: 'Orchestration carries it end to end',
    evidence:
      'The nine-stage pipeline, the gates that stop it, and the catalogue of subagents that run it.',
    anchor: 'foundation-orchestration',
  },
];

/** One resolved document content request. */
type FetchedDocument = {
  /** Key of the document in {@link SpecDocumentContents}. */
  key: string;
  /** Raw content of the document, read through the API text reader. */
  content: string;
};

/**
 * fetchSpecDocumentContents fetches the content of every visible spec document
 * and returns the ones that could be read.
 *
 * The requests are fanned out with `Promise.allSettled`, and each of them is
 * bounded by `SPEC_DOCUMENT_TIMEOUT_MS` rather than by the client's default: the
 * page renders nothing until every request has settled, so the slowest document
 * decides when the page appears, and a default sized for one awaited request
 * would let a single hung document withhold the whole page for ten seconds. A
 * document that rejects — a timeout, a 404, a restricted document — is degraded
 * to an omitted entry rather than an exception: the spec listing renders an
 * omitted document as its inline "content unavailable" disclosure, so one
 * unreadable document costs one line of text instead of the whole page
 * (RISK-006/007).
 *
 * Degrading is not the same as ignoring: a visitor sees one missing disclosure
 * and has no way to report what went wrong, so each rejection is written to the
 * server log first, naming the spec, the document and the reason, and is only
 * then dropped (`[LOG-001]`). The rejection is re-thrown rather than converted
 * to a value so that `Promise.allSettled` below stays the single place that
 * decides what a failed document does to the page.
 *
 * @param specs - the listable specs, each carrying its visible documents.
 * @returns the contents that were read, keyed by {@link specDocumentKey};
 *   documents that failed are absent from the map.
 */
async function fetchSpecDocumentContents(
  specs: Spec[],
): Promise<SpecDocumentContents> {
  const requests = specs.flatMap((spec) =>
    spec.documents.map(async (document): Promise<FetchedDocument> => {
      try {
        return {
          key: specDocumentKey(spec.id, document.document_id),
          content: await getSpecDocument(spec.id, document.document_id, {
            timeoutMs: SPEC_DOCUMENT_TIMEOUT_MS,
          }),
        };
      } catch (cause) {
        log('warn', 'spec document content could not be read', {
          spec_id: spec.id,
          document_id: document.document_id,
          reason: cause instanceof Error ? cause.message : String(cause),
        });
        throw cause;
      }
    }),
  );

  const results = await Promise.allSettled(requests);
  const contents: SpecDocumentContents = {};

  for (const result of results) {
    if (result.status === 'fulfilled') {
      contents[result.value.key] = {
        status: 'loaded',
        content: result.value.content,
      };
    }
  }

  return contents;
}

/**
 * AgentsPage renders the agents dossier at `/agents` (REQ-3.1 to REQ-3.4).
 *
 * The page is a narrative in three acts on the three foundations the homepage
 * summary names (REQ-2.3), in the homepage's order: the specs that say what to
 * do, with the spec ledger as the evidence; the indexed coding standards that
 * say how; then the orchestration that carries a change end to end — the
 * pipeline account followed by the subagent catalogue as its cast. An intro
 * section opens on the motivation — specifying every component end to end
 * before any code exists puts the attention on the product rather than the
 * engineering — and restates the three foundations as the page's own outline,
 * each linking to the act that tells it. The page is written for a reader who
 * already builds with agents, and it closes on the one call to action that
 * resolves its narrative: the contact section of the homepage, for readers
 * building a setup of their own.
 *
 * Everything on the route is fetched and rendered on the server. The two
 * listings are fetched eagerly and a failure of either propagates to the error
 * boundary — a page with no agents on it is not a page worth serving — while
 * the per-document content fan-out degrades individual failures instead.
 *
 * The page owns no shell of its own: the header, the footer and the content
 * column belong to the root layout, and no part of this route declares a client
 * boundary, so `/agents` ships zero client JavaScript. The intro's level-1
 * heading is the document's single top level; each act is authored as an `h2`.
 *
 * @returns the assembled agents page.
 */
export default async function AgentsPage() {
  const [agents, specs] = await Promise.all([listAgents(), listSpecs()]);
  const contents = await fetchSpecDocumentContents(specs);

  return (
    <div className="flex flex-col gap-16 py-12">
      <section aria-labelledby="agents-intro-heading">
        <SectionHeading
          id="agents-intro-heading"
          level={1}
          eyebrow="Agentic development"
          heading="How this site writes itself, and why I build this way"
          lede="If you build with agents yourself, you already know the model was never the hard part — the system around it is. Mine exists for a simple reason: it lets me spend my attention on the product rather than the engineering. Every component of this site was specified end to end — requirements, interfaces, acceptance criteria — before any code was written or run. Working that way forces the product questions to be answered first, and answered together, so what ships is a complete product rather than a series of features that happened to land; the engineering is delegated to a pipeline of subagents that carries each spec to a shipped change."
        />
        <p className="mt-4 max-w-(--measure-lede) text-base text-text-secondary">
          This page is that pipeline&apos;s own account of itself, written by
          the pipeline it describes — published not as a demo but as a working
          reference, in enough detail to borrow. The setup stands on the three
          foundations the homepage names — a spec says what to do, the indexed
          standards say how, and orchestration carries the change end to end,
          stopping at the gates that need a person. Each is told below, with the
          evidence beside the claim.
        </p>
        <nav aria-label="The three foundations" className="mt-6">
          {FOUNDATIONS.map((foundation) => (
            <div
              key={foundation.ordinal}
              className="grid grid-cols-[32px_1fr] gap-5 border-t border-border-subtle py-5 last:border-b"
            >
              <span className="pt-1 text-xs font-semibold text-accent-text">
                {foundation.ordinal}
              </span>
              <div>
                <a
                  href={`#${foundation.anchor}`}
                  className="text-base font-medium text-text-primary transition-colors hover:text-accent-text"
                >
                  {foundation.title}
                </a>
                <p className="mt-2 max-w-(--measure-prose) text-sm text-text-secondary">
                  {foundation.evidence}
                </p>
              </div>
            </div>
          ))}
        </nav>
      </section>

      <section id="foundation-specs" aria-labelledby="foundation-specs-heading">
        <SectionHeading
          id="foundation-specs-heading"
          eyebrow="Foundation 01 · What to do"
          heading="Specs tell agents what to do"
          lede="This is the discipline everything else on this page exists to serve. A change enters the pipeline as a spec: numbered requirements mapped to Gherkin acceptance criteria before any code exists. Those criteria are the definition of done — the pipeline's first stage reads the spec back for ambiguity and stops for a person, and its last act of judgement gives every criterion a verdict backed by evidence: a file and line, or the test that was run."
        />
        <p className="mt-4 max-w-(--measure-lede) text-base text-text-secondary">
          The ledger below is the evidence, not a summary of it: every spec this
          site was built from, published in full from the pipeline&apos;s own
          store, acceptance documents included — among them the spec that asked
          for the page you are reading.
        </p>
        <div className="mt-10">
          <SpecListing specs={specs} contents={contents} />
        </div>
      </section>

      <StandardsFoundation />

      <AgentWorkflow />

      <section aria-labelledby="agent-catalogue-heading">
        <SectionHeading
          id="agent-catalogue-heading"
          eyebrow="Foundation 03 · The specialists"
          heading="Every subagent, and what it is trusted with"
          lede="The hand-offs above only work because each stage is run by a narrow specialist with a declared input and output contract — the written documents that pass between stages are exactly what these schemas describe. The descriptions and schemas below are read from the API at request time, so this list is the one the pipeline actually runs."
        />
        <div className="mt-10">
          <AgentCatalogue agents={agents} />
        </div>
      </section>

      <section aria-labelledby="agents-cta-heading">
        <SectionHeading
          id="agents-cta-heading"
          eyebrow="Work with me"
          heading="Building your own agentic setup?"
          lede="Everything above is published so it can be borrowed: the specs, the standards index, the orchestration and its gates. If you are past believing in agentic development and into building it — turning improvised agent use into a setup that ships complete products — that is exactly the work I want to do with you."
        />
        <p className="mt-6">
          <Link
            href="/#contact"
            className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            Tell me what you&apos;re building →
          </Link>
        </p>
      </section>
    </div>
  );
}
