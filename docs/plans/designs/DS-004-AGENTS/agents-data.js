/* ==========================================================================
   DS-004-AGENTS — shared mockup content
   --------------------------------------------------------------------------
   Content for the mockup. It is real, not placeholder: STAGES mirrors the
   `implement-spec` orchestration procedure, AGENTS mirrors the thirteen agent
   definitions in the PSauerborn/agents plugin, and SPECS mirrors `docs/specs/`
   and the scenario tags in `acceptance/features/`.

   In production the catalogue and the spec ledger are server-rendered from
   `GET /v1/agents/list` and `GET /v1/agents/specs/list` (SPEC-002 § 6.1.4 /
   § 6.1.5); STAGES and CI_WORKFLOWS are static site content. The mockup builds
   its DOM from this literal only so the file stays reviewable — see
   DS-004-AGENTS.md § Accessibility Notes.
   ========================================================================== */

const REPO_URL = "https://github.com/PSauerborn/agents";

/* -- The orchestration pipeline ------------------------------------------ */
/* gate: run stops here for user approval.  conditional: does not always run. */

const STAGES = [
  {
    n: "01",
    id: "spec-review",
    name: "Spec review",
    gate: true,
    agents: [],
    owner: "orchestrator · review-spec skill",
    artifacts: ["Review findings"],
    summary:
      "The spec is reviewed for ambiguity, missing edge cases, scope spanning several deliverables, and internal contradictions before any work begins. Material findings halt the run until the spec is corrected or the findings are explicitly waived.",
  },
  {
    n: "02",
    id: "analysis",
    name: "Requirements analysis",
    agents: ["requirements-analyzer"],
    owner: "requirements-analyzer",
    artifacts: ["Scale assessment (JSON)"],
    summary:
      "Task type, scale, affected files, and UI impact are assessed against the codebase, with the expected files cited as evidence. The returned scale selects the flow — reduced, standard, or full — so the amount of process stays proportional to the work.",
  },
  {
    n: "03",
    id: "design",
    name: "Frontend design gate",
    gate: true,
    conditional: true,
    agents: ["frontend-designer"],
    owner: "frontend-designer",
    artifacts: ["3 × design option", "3 × HTML mockup"],
    summary:
      "Runs only when the analysis reports significant UI impact. Three meaningfully distinct options are produced and the user selects one before any UI work is planned. This section of the site is the product of that gate.",
  },
  {
    n: "04",
    id: "planning",
    name: "Planning",
    gate: true,
    agents: ["work-planner", "risk-analyzer"],
    owner: "work-planner · risk-analyzer",
    artifacts: ["WP-004.md", "WP-004-risk-plan.md"],
    summary:
      "The spec and the distilled analysis become a phased work plan with a design-to-plan traceability table, and a risk register whose mitigations are verified against the code later in the same run.",
  },
  {
    n: "05",
    id: "decomposition",
    name: "Decomposition",
    agents: ["task-decomposer"],
    owner: "task-decomposer",
    artifacts: ["TASK-001…N.md"],
    summary:
      "The plan is cut into single-commit tasks — one or two files, a diff under roughly 100 lines — each carrying its own investigation targets and an explicit target-file write set.",
  },
  {
    n: "06",
    id: "execution",
    name: "Execution",
    agents: ["task-executor"],
    owner: "task-executor ×N",
    artifacts: ["Code changes", "Execution manifest"],
    summary:
      "One executor per task file, written test-first. Executors run in parallel only when their write sets are disjoint. Every completion is appended to the execution manifest, which is the single record of what the run changed.",
  },
  {
    n: "07",
    id: "review",
    name: "Review & remediation",
    agents: [
      "validation-runner",
      "quality-controller",
      "code-reviewer",
      "security-reviewer",
      "risk-reviewer",
    ],
    owner: "five reviewers",
    artifacts: ["Quality report", "Risk review", "Remediation tasks"],
    summary:
      "Five reviewers read the same manifest changeset from five angles — suite results, standards, correctness, security, and risk-plan conformance. Findings become remediation task files that an executor runs, and the loop repeats until clean or the iteration cap is reached.",
  },
  {
    n: "08",
    id: "acceptance",
    name: "Acceptance",
    agents: ["acceptance-validator"],
    owner: "acceptance-validator",
    artifacts: ["Per-criterion verdicts"],
    summary:
      "Every acceptance criterion in the spec is verified against the implementation, citing a file and line or a passing scenario. Criteria too vague to verify are returned as unverifiable rather than guessed at.",
  },
  {
    n: "09",
    id: "documentation",
    name: "Documentation",
    agents: ["documenter"],
    owner: "documenter",
    artifacts: ["Changeset document", "Updated docs"],
    summary:
      "Doc strings, the OpenAPI schema, and the READMEs affected by the changeset are brought up to date, and the run is summarised in a changeset document. Staging and committing are left to the user.",
  },
];

/* -- The subagent catalogue ---------------------------------------------- */

const AGENTS = [
  {
    id: "requirements-analyzer",
    name: "requirements-analyzer",
    stage: "analysis",
    stageName: "Requirements analysis",
    role: "Analysis",
    purpose:
      "Analyses a spec or change request against the codebase to determine task type, work scale, affected files, UI impact, constraints, and open questions. Its scale assessment decides which orchestration flow runs, so every determination cites the files expected to change.",
    inputs: [
      { name: "requirements", required: true, note: "the request to assess" },
      { name: "context", required: false, note: "recent changes, constraints" },
    ],
    outputs: [
      { name: "scaleAssessment", note: "JSON — scale, taskType, affectedFiles, uiImpact" },
    ],
    model: "inherit",
    effort: "high",
    tools: "Read, Grep, Glob, LS, Bash, WebSearch",
  },
  {
    id: "frontend-designer",
    name: "frontend-designer",
    stage: "design",
    stageName: "Frontend design gate",
    role: "Design",
    purpose:
      "Produces three meaningfully distinct design options for a spec with significant UI changes — a design document and a self-contained static mockup each — grounded in the existing design system so any of the three could be implemented as-is.",
    inputs: [
      { name: "specPath", required: true, note: "spec whose UI is designed" },
      { name: "uiScope", required: false, note: "distilled UI constraints" },
      { name: "context", required: false, note: "revision feedback" },
    ],
    outputs: [
      { name: "designSetId", note: "e.g. DS-004-AGENTS" },
      { name: "options[]", note: "3 × design document + HTML mockup" },
    ],
    model: "inherit",
    effort: "high",
    tools: "Read, Grep, Glob, LS, Write",
  },
  {
    id: "work-planner",
    name: "work-planner",
    stage: "planning",
    stageName: "Planning",
    role: "Planning",
    purpose:
      "Converts the spec and the distilled requirements summary into one structured work plan: phases, implementation order, technical dependencies, and task identification. When a design was selected, the plan implements that design and cites it so downstream agents inherit it.",
    inputs: [
      { name: "specPath", required: true, note: "path to the spec" },
      { name: "requirementsSummary", required: true, note: "distilled analysis fields" },
      { name: "designPath", required: false, note: "user-selected design option" },
      { name: "mode", required: false, note: "create (default) | update" },
    ],
    outputs: [
      { name: "workPlanId", note: "WP-nnn" },
      { name: "planPath", note: "docs/plans/{date}-{workPlanId}.md" },
    ],
    model: "fable",
    effort: "high",
    tools: "Read, Write, Edit, Glob, LS",
  },
  {
    id: "risk-analyzer",
    name: "risk-analyzer",
    stage: "planning",
    stageName: "Planning",
    role: "Planning",
    purpose:
      "Reads the work plan and produces the risk register for its execution: delivery and technical risks with likelihood, impact, severity, and a concrete mitigation each, plus a design-to-risk traceability table mapping risks to the tasks that must honour them.",
    inputs: [
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "requirements", required: true, note: "the request being planned" },
      { name: "context", required: false, note: "" },
    ],
    outputs: [
      { name: "riskPlanPath", note: "{workPlanId}-risk-plan.md" },
      { name: "risks[]", note: "RISK-nnn, severity, mitigation" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Write, Glob, LS",
  },
  {
    id: "task-decomposer",
    name: "task-decomposer",
    stage: "decomposition",
    stageName: "Decomposition",
    role: "Planning",
    purpose:
      "Decomposes the work plan into independent, single-commit task files. Each file is the entire context its executor receives, so its read set and write set must be both complete and minimal — one or two files touched, a diff reviewable in under 100 lines.",
    inputs: [
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "planPath", required: true, note: "path to the work plan" },
    ],
    outputs: [
      { name: "tasks[]", note: "task file paths, dependencies, targetFiles" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Write, Glob, LS",
  },
  {
    id: "task-executor",
    name: "task-executor",
    stage: "execution",
    stageName: "Execution",
    role: "Execution",
    purpose:
      "Executes exactly one task file end-to-end — investigation, red-green-refactor implementation, and progress ticking — and never asks questions. Anything missing, ambiguous, or outside its target files is returned as a typed blocked response instead of improvised.",
    inputs: [
      { name: "taskFilePath", required: true, note: "one executable task file" },
    ],
    outputs: [
      { name: "filesModified[]", note: "write set actually touched" },
      { name: "testsAdded[]", note: "tests written for the change" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Edit, Write, MultiEdit, Bash, Grep, Glob, LS, TaskCreate, TaskUpdate",
  },
  {
    id: "validation-runner",
    name: "validation-runner",
    stage: "review",
    stageName: "Review & remediation",
    role: "Review",
    purpose:
      "The CI stage. Discovers the project's build, test, lint, format, and type checks from repo configuration and runs the full suite against the whole project — the only agent that validates the changeset as a whole. A skipped discoverable check is a failed run.",
    inputs: [
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "manifestPath", required: true, note: "execution manifest" },
    ],
    outputs: [
      { name: "checks[]", note: "per-check pass / fail / not-run with output" },
      { name: "remediationTask", note: "TASK-VALIDATION-REMEDIATION.md on failure" },
    ],
    model: "sonnet",
    effort: "medium",
    tools: "Read, Write, Bash, Grep, Glob, LS",
  },
  {
    id: "quality-controller",
    name: "quality-controller",
    stage: "review",
    stageName: "Review & remediation",
    role: "Review",
    purpose:
      "Reviews the changeset for coding-standards conformance and nothing else. Every finding cites the standards file, rule ID, path, and line; opinions that map to no rule are left out of the report.",
    inputs: [
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "manifestPath", required: true, note: "execution manifest" },
    ],
    outputs: [
      { name: "qualityReport", note: "{workPlanId}-quality-report.md" },
      { name: "remediationTask", note: "TASK-QC-REMEDIATION.md on violations" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Grep, Glob, LS, Bash, Write",
  },
  {
    id: "code-reviewer",
    name: "code-reviewer",
    stage: "review",
    stageName: "Review & remediation",
    role: "Review",
    purpose:
      "The peer review. Reads the changeset diff the way a senior engineer reads a pull request — correctness, edge cases, and design — and constructs the concrete input or state that breaks the code rather than reporting suspicions.",
    inputs: [
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "manifestPath", required: true, note: "execution manifest" },
      { name: "specPath", required: true, note: "intended behaviour" },
    ],
    outputs: [
      { name: "findings[]", note: "file:line, failure scenario, severity" },
      { name: "remediationTask", note: "TASK-CODE-REVIEW-REMEDIATION.md on findings" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Grep, Glob, LS, Bash, Write",
  },
  {
    id: "security-reviewer",
    name: "security-reviewer",
    stage: "review",
    stageName: "Review & remediation",
    role: "Review",
    purpose:
      "Reviews the changeset for injection, authentication and authorisation flaws, secrets handling, unsafe deserialisation, path traversal, SSRF, and dependency risk. Each finding names the vulnerability class and a concrete attack scenario.",
    inputs: [
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "manifestPath", required: true, note: "execution manifest" },
    ],
    outputs: [
      { name: "findings[]", note: "class, file:line, attack scenario" },
      { name: "remediationTask", note: "TASK-SEC-REMEDIATION.md on findings" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Grep, Glob, LS, Write",
  },
  {
    id: "risk-reviewer",
    name: "risk-reviewer",
    stage: "review",
    stageName: "Review & remediation",
    role: "Review",
    purpose:
      "Checks the code actually written against the mitigations the risk plan promised. Each risk is classified mitigated, deviation-found, or not-applicable, and every status cites a file and line.",
    inputs: [
      { name: "riskPlanPath", required: true, note: "the risk register" },
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "manifestPath", required: true, note: "execution manifest" },
    ],
    outputs: [
      { name: "riskReview", note: "{workPlanId}-risk-review.md" },
      { name: "remediationTask", note: "TASK-RISK-REMEDIATION.md on deviations" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Grep, Glob, LS, Write",
  },
  {
    id: "acceptance-validator",
    name: "acceptance-validator",
    stage: "acceptance",
    stageName: "Acceptance",
    role: "Acceptance",
    purpose:
      "The final gate. Every other stage validates process; this one validates outcome — does the software do what the spec asked. A criterion passes only on evidence: implementing code, a passing scenario, or the output of a command run in the session.",
    inputs: [
      { name: "specPath", required: true, note: "source of criteria" },
      { name: "planPath", required: true, note: "traceability table" },
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "manifestPath", required: true, note: "execution manifest" },
    ],
    outputs: [
      { name: "criteria[]", note: "met | unmet | unverifiable, with evidence" },
    ],
    model: "inherit",
    effort: "medium",
    tools: "Read, Grep, Glob, LS, Bash",
  },
  {
    id: "documenter",
    name: "documenter",
    stage: "documentation",
    stageName: "Documentation",
    role: "Documentation",
    purpose:
      "Brings the documentation for the changeset up to date — doc strings, the OpenAPI schema, and the READMEs whose described behaviour changed — and writes the changeset summary document for the run.",
    inputs: [
      { name: "workPlanId", required: true, note: "WP-nnn" },
      { name: "manifestPath", required: true, note: "execution manifest" },
    ],
    outputs: [
      { name: "changesetDocument", note: "{workPlanId}-changeset.md" },
      { name: "documentationUpdates[]", note: "files touched" },
    ],
    model: "sonnet",
    effort: "low",
    tools: "Read, Write, Edit, Glob, LS",
  },
];

/* -- The specs that built the site --------------------------------------- */
/* criteria[] are real rows from each spec's acceptance-criteria table;
   criteriaTotal is the full count, of which criteria[] shows a sample.       */

const SPECS = [
  {
    spec_id: "SPEC-001",
    title: "Database and Schema",
    date: "2026-08-04",
    description:
      "PostgreSQL schema and alembic migrations for the contact, CV, blog, and agent-catalogue data the rest of the system reads.",
    documents: [
      { filename: "SPEC-001.md", document_type: "SPEC" },
      { filename: "SPEC-001-REVIEW.md", document_type: "OTHER" },
    ],
    criteriaTotal: 0,
    criteria: [],
    note: "Verified through migration and repository tests rather than tagged scenarios.",
  },
  {
    spec_id: "SPEC-002",
    title: "API",
    date: "2026-08-01",
    description:
      "The public read API the site is built on: CV, blog articles and comments, the subagent catalogue, and the spec register.",
    documents: [
      { filename: "SPEC-002.md", document_type: "SPEC" },
      { filename: "agent_catalogue.feature", document_type: "ACCEPTANCE" },
      { filename: "cv.feature", document_type: "ACCEPTANCE" },
      { filename: "blog.feature", document_type: "ACCEPTANCE" },
    ],
    criteriaTotal: 36,
    criteria: [
      { id: "AC-10", req: "REQ-2.5", scenario: "An empty CV returns empty collections" },
      { id: "AC-11", req: "REQ-2.6", scenario: "Headline skills are grouped by category" },
      { id: "AC-24", req: "REQ-5.2", scenario: "A request is made to list subagents" },
      {
        id: "AC-25",
        req: "REQ-5.2",
        scenario: "A subagent without declared schemas returns empty schema objects",
      },
      { id: "AC-26", req: "REQ-5.3", scenario: "A request is made to list specs" },
      { id: "AC-27", req: "REQ-5.3", scenario: "A spec without a linked document is not listed" },
      { id: "AC-28", req: "REQ-5.5", scenario: "A request is made to get the content of a spec" },
    ],
  },
  {
    spec_id: "SPEC-003",
    title: "Admin API Endpoints",
    date: "2026-08-01",
    description:
      "API-key authenticated admin endpoints for managing contacts, messages, blog posts, and specs, with an audit log over every admin request.",
    documents: [
      { filename: "SPEC-003.md", document_type: "SPEC" },
      { filename: "agent_catalogue.feature", document_type: "ACCEPTANCE" },
      { filename: "contacts.feature", document_type: "ACCEPTANCE" },
    ],
    criteriaTotal: 28,
    criteria: [
      {
        id: "AC-1",
        req: "REQ-1.1, REQ-1.2",
        scenario: "The API rejects unauthenticated requests to admin endpoints",
      },
      { id: "AC-3", req: "REQ-1.5", scenario: "An authenticated admin request is recorded in the audit log" },
      { id: "AC-18", req: "REQ-5.2", scenario: "The API rejects unauthenticated requests to create specs" },
      { id: "AC-21", req: "REQ-5.4", scenario: "An admin sets the visibility of a spec" },
    ],
  },
  {
    spec_id: "SPEC-004",
    title: "UI",
    date: "2026-08-11",
    description:
      "The server-side rendered React application in front of the API — the CV display, this agentic development section, the blog, and the contact form.",
    documents: [{ filename: "SPEC-004.md", document_type: "SPEC" }],
    criteriaTotal: 0,
    criteria: [],
    note: "In flight — scenarios are tagged @spec-004 as each section lands.",
    current: true,
  },
];

/* -- Continuous integration ---------------------------------------------- */
/* The workflows that run the acceptance suite the specs above are traced to. */

const CI_WORKFLOWS = [
  { name: "pre-merge.yaml", purpose: "Lint, unit tests, and secret scan on every pull request" },
  { name: "integration-tests.yaml", purpose: "Godog acceptance suite against a live Postgres service" },
  { name: "post-merge.yaml", purpose: "Image build and publish on merge to master" },
  { name: "tf-plan.yaml", purpose: "Terraform plan posted to the pull request" },
  { name: "tf-apply.yaml", purpose: "Terraform apply on merge" },
];
