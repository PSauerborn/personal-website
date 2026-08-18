import { SectionHeading } from '@/components/ui/section-heading';
import { siteConfig } from '@/lib/siteConfig';

/** One stage of the `subagents-dev` pipeline. */
type PipelineStage = {
  /** Two-digit ordinal, matching the order the stage runs in. */
  ordinal: string;
  /** Short stage name, used by both the diagram and the narrative. */
  name: string;
  /** Marker shown beside the name when the stage stops or is conditional. */
  gate?: string;
  /** One or two sentences describing what the stage does and hands on. */
  description: string;
};

/**
 * The full `subagents-dev` orchestration, in the order it runs (REQ-3.2).
 *
 * This one list drives the diagram and the narrative below it, so the two can
 * never disagree about what the pipeline does. Each entry names the stage, not
 * the agent that implements it — the agent catalogue documents the agents, and
 * its `stage` prose uses these same names.
 *
 * The sequence is the full flow, the one a large change runs. Two stages are
 * conditional on what the analysis in stage two finds: the design gate runs
 * only for significant interface work, and risk planning and risk review only
 * on the full flow. Smaller changes run the same stages minus those.
 */
const PIPELINE_STAGES: readonly PipelineStage[] = [
  {
    ordinal: '01',
    name: 'Spec review',
    gate: 'Stops for approval',
    description:
      'The spec is read back for ambiguity, missing edge cases, contradictions and scope spanning more than one deliverable. Nothing downstream runs until the findings are corrected or explicitly waived.',
  },
  {
    ordinal: '02',
    name: 'Requirements analysis',
    description:
      'The change is sized against the codebase: what kind of task it is, which files it touches, and whether it has a user interface. The file count then picks the flow — one or two files run a reduced one, three to five the standard one, six or more the full one below.',
  },
  {
    ordinal: '03',
    name: 'Design gate',
    gate: 'Conditional stop',
    description:
      'Runs only when the analysis reports significant interface impact. Three structurally distinct design options are produced, each a design document and a self-contained static mockup, and the one a human picks is what the plan is written against.',
  },
  {
    ordinal: '04',
    name: 'Planning',
    gate: 'Stops for approval',
    description:
      'A work plan sequences the change into phases and tasks traced back to requirement IDs. On the full flow a risk plan is written against it independently, and the two are approved together, so the human gate covers the ordering and the risks at once.',
  },
  {
    ordinal: '05',
    name: 'Decomposition',
    description:
      'Each work item becomes a self-contained task file naming its own investigation targets, its write set, its test-first steps and its completion criteria. That file is the entire context the executing agent receives.',
  },
  {
    ordinal: '06',
    name: 'Execution',
    description:
      'One agent implements one task file under red-green-refactor, reading only what the file lists and writing only what it names; an agent that would have to edit anything else returns blocked instead of improvising. Two tasks run at once only when neither depends on the other and their write sets are disjoint, and every result is appended to a manifest that is the single record of what the changeset contains.',
  },
  {
    ordinal: '07',
    name: 'Review gates',
    gate: 'Loops, then stops',
    description:
      'Validation, the indexed coding standards, correctness, security and — on the full flow — the promised risk mitigations are reviewed independently against that manifest. Findings come back as remediation tasks that go through execution rather than being fixed by the reviewer who raised them, and each reviewer that raised one runs again afterwards. The loop is capped at two rounds; anything still outstanding stops for a person.',
  },
  {
    ordinal: '08',
    name: 'Acceptance validation',
    gate: 'Stops if unmet',
    description:
      'Every acceptance criterion in the spec is given a verdict and the evidence for it — a file and line, or the test that was run. The criteria written in stage one are the definition of done, and any left unmet or unverifiable stop the run rather than being carried quietly into the changeset.',
  },
  {
    ordinal: '09',
    name: 'Documentation',
    description:
      'Doc strings, API schemas and READMEs are brought up to date and a changeset record is written, once the work is green, so the history of the repository explains itself without anyone having to read the diff.',
  },
];

/** Identifier of the diagram title, referenced as its accessible name. */
const DIAGRAM_TITLE_ID = 'agent-workflow-diagram-title';

/** Identifier of the diagram description, its accessible text alternative. */
const DIAGRAM_DESC_ID = 'agent-workflow-diagram-desc';

/** Vertical distance between two stage nodes of the diagram, in user units. */
const STAGE_STEP = 52;

/** Distance from the top of the diagram to the first stage node. */
const DIAGRAM_PADDING = 26;

/** Horizontal position of the spine the stage nodes sit on. */
const SPINE_X = 18;

/**
 * Width of the diagram viewBox, in user units.
 *
 * It matches the `--container-form` cap the SVG is rendered at, so one user
 * unit is one pixel at full size and the labels are set at their true 12px and
 * 14px sizes rather than at a scaled-up or scaled-down approximation.
 */
const DIAGRAM_WIDTH = 520;

/**
 * stageNodeY returns the vertical centre of the stage at the given index.
 *
 * @param index - zero-based position of the stage in `PIPELINE_STAGES`.
 * @returns the y coordinate of the stage node, in viewBox user units.
 */
function stageNodeY(index: number): number {
  return DIAGRAM_PADDING + index * STAGE_STEP;
}

/**
 * PipelineDiagram renders the graphical representation of the full pipeline
 * (REQ-3.2) as inline SVG: a single spine running top to bottom, one node per
 * stage, and the stage name beside it with any gate marker set to its right.
 *
 * The graphic is drawn rather than fetched — no image, no asset pipeline and no
 * client JavaScript — and every colour is read from the `globals.css` tokens so
 * it stays in the palette. It is exposed as one `img` node whose accessible
 * name and description carry the same stage sequence the drawing shows, so the
 * diagram is never the only way to get the information.
 *
 * @returns the diagram element.
 */
function PipelineDiagram() {
  const lastIndex = PIPELINE_STAGES.length - 1;
  const height = stageNodeY(lastIndex) + DIAGRAM_PADDING;
  const sequence = PIPELINE_STAGES.map((stage) => stage.name).join(' → ');

  return (
    <svg
      role="img"
      aria-labelledby={DIAGRAM_TITLE_ID}
      aria-describedby={DIAGRAM_DESC_ID}
      viewBox={`0 0 ${DIAGRAM_WIDTH} ${height}`}
      className="h-auto w-full max-w-(--container-form)"
    >
      <title id={DIAGRAM_TITLE_ID}>
        The subagents-dev pipeline, stage by stage
      </title>
      <desc id={DIAGRAM_DESC_ID}>
        {`The pipeline runs in ${PIPELINE_STAGES.length} stages, top to bottom: ${sequence}. Review gates hand their findings back to execution.`}
      </desc>

      <line
        x1={SPINE_X}
        y1={stageNodeY(0)}
        x2={SPINE_X}
        y2={stageNodeY(lastIndex)}
        stroke="var(--color-border-strong)"
        strokeWidth={1}
      />

      {PIPELINE_STAGES.map((stage, index) => {
        const y = stageNodeY(index);
        const isGate = stage.gate !== undefined;

        return (
          <g key={stage.ordinal}>
            <circle
              cx={SPINE_X}
              cy={y}
              r={isGate ? 6 : 4}
              fill={isGate ? 'var(--color-accent)' : 'var(--color-bg)'}
              stroke={
                isGate
                  ? 'var(--color-accent-bright)'
                  : 'var(--color-accent-text)'
              }
              strokeWidth={1}
            />
            <text
              x={SPINE_X + 26}
              y={y + 4}
              fill="var(--color-text-primary)"
              fontFamily="var(--font-sans)"
              fontSize={14}
            >
              {stage.name}
            </text>
            {stage.gate ? (
              <text
                x={DIAGRAM_WIDTH - 8}
                y={y + 4}
                textAnchor="end"
                fill="var(--color-text-tertiary)"
                fontFamily="var(--font-sans)"
                fontSize={12}
              >
                {stage.gate}
              </text>
            ) : null}
          </g>
        );
      })}
    </svg>
  );
}

/**
 * AgentWorkflow renders the authored account of the agentic development
 * workflow behind this site (REQ-3.1, REQ-3.2, REQ-3.5).
 *
 * On the page's narrative this is the third act — orchestration, the
 * foundation that makes the other two binding: the heading and lede tie the
 * pipeline back to the spec (foundation one) and the standards index
 * (foundation two), and the section carries the `foundation-orchestration`
 * anchor the intro's outline links to.
 *
 * The section follows the DES-001 broadsheet grammar: a caps signpost over one
 * section heading and a lede, then the pipeline diagram, then the narrative as
 * hairline-ruled numbered rows carrying the same stages in the same order. It
 * is a Server Component with no client boundary of its own, so `/agents` still
 * ships zero client JavaScript.
 *
 * The link to the agents repository renders only when the site configuration
 * carries a URL. While the URL is outstanding the section omits the link
 * entirely rather than rendering a dead or guessed one, so REQ-3.5 is visibly
 * unmet instead of quietly wrong.
 *
 * @returns the workflow section element.
 */
export function AgentWorkflow() {
  const repositoryUrl = siteConfig.agentsRepositoryUrl;

  return (
    <section
      id="foundation-orchestration"
      aria-labelledby="agent-workflow-heading"
      data-slot="agent-workflow"
    >
      <SectionHeading
        id="agent-workflow-heading"
        eyebrow="Foundation 03 · End to end"
        heading="Orchestration carries a change from spec to changeset"
        lede="The first two foundations are documents; orchestration is what makes them binding. An orchestrator delegates each stage to a subagent that can only read what its task file lists and only write what its task file names, every stage hands the next a written document rather than a conversation, and the run stops at the gates that need a person. The first and last stages hold the change to its spec, the review gates hold it to the standards index it was written under, and nothing moves between stages except documents that can be audited afterwards."
      />
      {repositoryUrl ? (
        <p className="mt-6">
          <a
            href={repositoryUrl}
            className="text-sm font-medium text-text-secondary transition-colors hover:text-text-primary"
          >
            View the agents repository →
          </a>
        </p>
      ) : null}

      <p className="mt-10 text-xs font-semibold tracking-wide text-text-tertiary uppercase">
        Workflow
      </p>
      <div className="mt-6">
        <PipelineDiagram />
      </div>

      <ol className="mt-10">
        {PIPELINE_STAGES.map((stage) => (
          <li
            key={stage.ordinal}
            className="grid grid-cols-[32px_1fr] gap-5 border-t border-border-subtle py-5 last:border-b"
          >
            <span className="pt-1 font-mono text-xs font-semibold text-accent-text">
              {stage.ordinal}
            </span>
            <div>
              <h3 className="text-base font-medium text-text-primary">
                {stage.name}
                {stage.gate ? (
                  <span className="ml-3 text-xs font-normal text-text-tertiary">
                    {stage.gate}
                  </span>
                ) : null}
              </h3>
              <p className="mt-2 max-w-(--measure-prose) text-sm text-text-secondary">
                {stage.description}
              </p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
