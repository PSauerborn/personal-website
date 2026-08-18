import { EmptyState } from '@/components/ui/empty-state';
import { SelectSwitcher } from '@/components/ui/select-switcher';
import type { Agent, AgentSchema } from '@/lib/api/types';

/**
 * Purpose prose authored by this repository for the subagents it defines.
 *
 * The API description states what an agent does; `stage` and `purpose` state
 * where it sits in the pipeline and why the pipeline needs it (SPEC-003
 * REQ-3.3). Agents outside this map — an agent published after this component
 * was written — fall back to `FALLBACK_PROSE` rather than rendering a gap.
 *
 * The keys are the thirteen agent names of the `subagents-dev` plugin, and the
 * `stage` values are the stage names used by `AgentWorkflow`, so the catalogue
 * and the pipeline account agree on where each agent runs. An agent renamed
 * upstream falls back rather than misreporting its stage.
 */
const AGENT_PROSE: Record<string, { stage: string; purpose: string }> = {
  'requirements-analyzer': {
    stage: 'Requirements analysis',
    purpose:
      'Sizes the change against the codebase — how many files, what kind of task, whether it touches the interface — and that assessment is what selects the flow the rest of the run follows.',
  },
  'frontend-designer': {
    stage: 'Design gate',
    purpose:
      'Produces three structurally distinct design options with static mockups, grounded in the existing codebase, for a human to choose between before any interface work is planned.',
  },
  'work-planner': {
    stage: 'Planning',
    purpose:
      'Turns an approved spec into a sequenced work plan, so every later stage argues about an ordering that is already written down.',
  },
  'risk-analyzer': {
    stage: 'Planning',
    purpose:
      'Scores the work plan for delivery and technical risk up front and writes the mitigations down, which is what gives the risk review something specific to check later.',
  },
  'task-decomposer': {
    stage: 'Decomposition',
    purpose:
      'Splits each work item into self-contained task files that name their own investigation targets and write set, which is what keeps an executing agent inside its lane.',
  },
  'task-executor': {
    stage: 'Execution',
    purpose:
      'Implements exactly one task file under red-green-refactor, and returns blocked rather than improvising when the file it needs is out of scope.',
  },
  'validation-runner': {
    stage: 'Review gates',
    purpose:
      'Discovers the project’s own build, test, lint and type-check commands and runs them over the whole changeset — the only stage that validates the change as a whole rather than one task at a time.',
  },
  'quality-controller': {
    stage: 'Review gates',
    purpose:
      'Checks the changeset against the indexed coding standards and nothing else, so style and structure never depend on the reviewer who happened to look.',
  },
  'code-reviewer': {
    stage: 'Review gates',
    purpose:
      'Reads the changeset the way a senior engineer reads a pull request, and files findings as remediation tasks instead of editing the branch itself.',
  },
  'security-reviewer': {
    stage: 'Review gates',
    purpose:
      'Audits the same changeset for exposure — injection, authorisation, secrets, deserialisation, traversal and dependency risk — independently of the correctness review.',
  },
  'risk-reviewer': {
    stage: 'Review gates',
    purpose:
      'Reads the risk plan back against the code as actually written, so a mitigation that was promised at planning time cannot quietly go unimplemented.',
  },
  'acceptance-validator': {
    stage: 'Acceptance validation',
    purpose:
      'Judges the outcome rather than the process: every acceptance criterion of the spec gets a verdict and the evidence for it, cited by file or by the test that was run.',
  },
  documenter: {
    stage: 'Documentation',
    purpose:
      'Brings doc strings, API schemas and READMEs up to date and writes the changeset record, so the history of the repository explains itself without reading the diff.',
  },
};

/** Prose used for an agent this repository has authored none for. */
const FALLBACK_PROSE = {
  stage: 'Pipeline',
  purpose:
    'Part of the subagent pipeline that produced this site. Its published description above is the authoritative account of what it does.',
};

/** Label shown in place of a schema the agent declares no fields for. */
const NO_FIELDS = 'None declared';

/**
 * describeField renders the declared type of a single schema field as text.
 *
 * The API returns free-form schema objects, so a field is described by its own
 * value where that value says something useful — a bare type name, or a JSON
 * Schema fragment carrying a `type` — and by its JavaScript shape otherwise.
 *
 * @param value - the declared value of the field.
 * @returns a short human-readable type description.
 */
function describeField(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (Array.isArray(value)) {
    return 'array';
  }
  if (value !== null && typeof value === 'object') {
    const declared = (value as { type?: unknown }).type;
    return typeof declared === 'string' ? declared : 'object';
  }
  return typeof value;
}

/** Props accepted by `SchemaBlock`. */
type SchemaBlockProps = {
  /** Caps signpost naming the schema, `Inputs` or `Outputs`. */
  label: string;
  /** The schema itself; an empty object renders the "none" line. */
  schema: AgentSchema;
};

/**
 * SchemaBlock renders one declared schema as a signpost over field lines.
 *
 * An empty schema is a normal answer from the API rather than an error, so it
 * renders an explicit "None declared" line — never an empty block. The block is
 * a sub-panel on `--color-surface-active`, so the schema pair reads as a pair
 * and a schema declaring nothing keeps the same shape as one declaring fields
 * instead of collapsing against it.
 *
 * @param label - caps signpost naming the schema.
 * @param schema - the declared fields, possibly empty.
 * @returns the schema block element.
 */
function SchemaBlock({ label, schema }: SchemaBlockProps) {
  const fields = Object.entries(schema);

  return (
    <div className="rounded-md bg-surface-active p-4">
      <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
        {label}
      </p>
      {fields.length === 0 ? (
        <p className="mt-2 text-sm text-text-tertiary">{NO_FIELDS}</p>
      ) : (
        <dl className="mt-2 space-y-1">
          {fields.map(([field, declared]) => (
            <div key={field} className="flex items-baseline gap-2">
              <dt className="font-mono text-sm text-text-secondary">{field}</dt>
              <dd className="font-mono text-xs text-text-tertiary">
                {describeField(declared)}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/** Props accepted by `AgentCatalogue`. */
export type AgentCatalogueProps = {
  /** Every published agent, fetched by the page (`GET /v1/agents`). */
  agents: Agent[];
};

/** The `id` of the panel, linking the switcher to the bodies it drives. */
const PANEL_ID = 'agent-catalogue-panel';

/** The `id` of the panel header's select, paired to its label. */
const SELECT_ID = 'agent-catalogue-select';

/**
 * AgentCatalogue renders the subagents behind this site as one bounded panel.
 *
 * The panel shows one subagent at a time (REQ-RV1-2.1), but it is not a
 * filtered render: every agent body is server-rendered inside the panel and
 * carries `data-agent`, so a crawler reads the whole catalogue and the page
 * needs no JavaScript to be complete. `SelectSwitcher` — the one client
 * boundary, and deliberately a `ui/**` primitive so this route stays free of
 * client components — marks the chosen body `data-selected` and stamps
 * `data-switcher="ready"` on the panel on mount; a single rule in `globals.css`
 * hides the rest. With JavaScript disabled that rule never matches, the select
 * is inert, and all the bodies stay visible, which is the accepted degradation.
 *
 * Inside a body: the mono agent name over its pipeline stage, the description
 * published by the API followed by the purpose prose authored here, and the
 * declared input and output schemas as a pair of sub-panels. This component
 * fetches nothing itself.
 *
 * @param agents - every published agent, in the order the API returned them.
 * @returns the catalogue panel, or the designed empty state when there are no
 *   agents to list — in which case no panel and no select is drawn at all.
 */
export function AgentCatalogue({ agents }: AgentCatalogueProps) {
  if (agents.length === 0) {
    return (
      <EmptyState
        label="Agent catalogue"
        statement="No agents published yet"
        description="The subagents behind this site are published from the agents repository; the catalogue fills in as they land."
      />
    );
  }

  const options = agents.map((agent) => ({
    value: agent.id,
    label: agent.name,
  }));

  return (
    <div
      id={PANEL_ID}
      data-slot="agent-catalogue"
      className="overflow-hidden rounded-xl bg-surface shadow-(--hairline-soft)"
    >
      <div className="bg-surface-active px-5 py-4 shadow-(--hairline-soft)">
        <SelectSwitcher
          panelId={PANEL_ID}
          selectId={SELECT_ID}
          label="Subagent"
          itemNoun="agents"
          options={options}
        />
      </div>
      <ul className="flex flex-col">
        {agents.map((agent) => {
          const prose = AGENT_PROSE[agent.id] ?? AGENT_PROSE[agent.name];
          const { stage, purpose } = prose ?? FALLBACK_PROSE;
          const nameId = `agent-${agent.id}-name`;

          return (
            <li
              key={agent.id}
              data-agent={agent.id}
              aria-labelledby={nameId}
              className="space-y-5 px-5 py-6 shadow-[inset_0_-1px_0_0_var(--color-border-subtle)] last:shadow-none"
            >
              <div>
                <p
                  id={nameId}
                  className="font-mono text-sm font-medium text-text-primary"
                >
                  {agent.name}
                </p>
                <p className="mt-1 text-xs text-text-tertiary">{stage}</p>
              </div>
              <div className="max-w-(--measure-lede) space-y-2">
                <p className="text-sm text-text-secondary">
                  {agent.description}
                </p>
                <p className="text-sm text-text-tertiary">{purpose}</p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <SchemaBlock label="Inputs" schema={agent.inputs} />
                <SchemaBlock label="Outputs" schema={agent.outputs} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
