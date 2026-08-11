/**
 * Shared CV types and sample data for design set DS-004-CV.
 *
 * Types mirror the `GET /v1/cv` response schema defined in SPEC-002 § 6.1.3
 * exactly — field names, nullability, and grouping all match the API so the
 * design options can be wired to the real endpoint without a mapping layer.
 */

/** Headline skills, grouped by category. Uncategorised stack items are not returned (SPEC-002 REQ-2.6). */
export type Skills = Record<string, string[]>;

export interface ExperienceEntry {
  id: string;
  /** ISO-8601 date string. */
  start_date: string;
  /** Null indicates a current role (SPEC-002 REQ-2.4). */
  end_date: string | null;
  organization: string;
  job_title: string;
  description: string;
  tech_stack: string[];
}

export interface EducationEntry {
  id: string;
  institution: string;
  /** Certificate type, e.g. "BSc", "MSc", "PhD". */
  certificate: string;
  start_date: string;
  end_date: string | null;
}

export interface CV {
  skills: Skills;
  /** Sorted by start_date descending (SPEC-002 REQ-2.4). */
  experience: ExperienceEntry[];
  /** Sorted by start_date descending (SPEC-002 REQ-2.4). */
  education: EducationEntry[];
}

// ---------------------------------------------------------------------------
// Formatting helpers — shared by all three options so date rendering is
// identical regardless of which design is chosen.
// ---------------------------------------------------------------------------

const MONTH_YEAR: Intl.DateTimeFormatOptions = { month: "short", year: "numeric" };

export function formatMonth(date: string): string {
  return new Date(date).toLocaleDateString("en-GB", MONTH_YEAR);
}

/** "Feb 2023 — Present" for current roles, "Jun 2020 — Jan 2023" otherwise. */
export function formatRange(start: string, end: string | null): string {
  return `${formatMonth(start)} — ${end ? formatMonth(end) : "Present"}`;
}

/** "2 yrs 5 mos" — rendered as secondary metadata next to a date range. */
export function formatDuration(start: string, end: string | null): string {
  const from = new Date(start);
  const to = end ? new Date(end) : new Date();
  const months =
    (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
  const years = Math.floor(months / 12);
  const rest = months % 12;

  const parts: string[] = [];
  if (years > 0) parts.push(`${years} yr${years === 1 ? "" : "s"}`);
  if (rest > 0) parts.push(`${rest} mo${rest === 1 ? "" : "s"}`);
  return parts.join(" ") || "< 1 mo";
}

export const isCurrent = (entry: { end_date: string | null }): boolean =>
  entry.end_date === null;

// ---------------------------------------------------------------------------
// Sample data — placeholder content for the mockups only. Production data is
// fetched server-side from GET /v1/cv (SPEC-004 REQ-1.1).
// ---------------------------------------------------------------------------

export const sampleCV: CV = {
  skills: {
    Languages: ["Go", "Python", "Rust", "TypeScript", "SQL"],
    Infrastructure: ["Kubernetes", "Terraform", "AWS", "Docker", "ArgoCD"],
    Data: ["PostgreSQL", "Kafka", "Redis", "ClickHouse", "dbt"],
    Practices: [
      "Event-driven architecture",
      "Observability",
      "Test-driven development",
      "Spec-driven development",
    ],
  },
  experience: [
    {
      id: "exp-01",
      start_date: "2023-02-01",
      end_date: null,
      organization: "Helix Systems",
      job_title: "Principal Backend Engineer",
      description:
        "Lead engineer on the event platform processing several million messages a day. Introduced a schema registry and replay tooling that cut incident recovery from hours to minutes, and mentor four engineers across two squads.",
      tech_stack: ["Go", "Kafka", "Kubernetes", "PostgreSQL", "Terraform"],
    },
    {
      id: "exp-02",
      start_date: "2020-06-01",
      end_date: "2023-01-31",
      organization: "Northwind Data",
      job_title: "Senior Platform Engineer",
      description:
        "Built the internal API gateway and deployment platform used by every product team. Migrated 40+ services from VMs to Kubernetes with no customer-facing downtime.",
      tech_stack: ["Go", "Kubernetes", "ArgoCD", "AWS", "Redis"],
    },
    {
      id: "exp-03",
      start_date: "2018-03-01",
      end_date: "2020-05-31",
      organization: "Argos Analytics",
      job_title: "Backend Engineer",
      description:
        "Owned the ingestion pipeline behind the customer-facing analytics product, scaling it from thousands to hundreds of millions of events per day.",
      tech_stack: ["Python", "ClickHouse", "Airflow", "AWS", "dbt"],
    },
    {
      id: "exp-04",
      start_date: "2016-09-01",
      end_date: "2018-02-28",
      organization: "Bytemark Labs",
      job_title: "Software Engineer",
      description:
        "First engineering hire. Shipped the original REST API and the internal tooling the support team still runs on.",
      tech_stack: ["Python", "PostgreSQL", "Docker", "Flask"],
    },
  ],
  education: [
    {
      id: "edu-01",
      institution: "Technical University of Munich",
      certificate: "MSc Computer Science",
      start_date: "2014-10-01",
      end_date: "2016-07-31",
    },
    {
      id: "edu-02",
      institution: "University of Nottingham",
      certificate: "BSc Physics",
      start_date: "2011-09-01",
      end_date: "2014-06-30",
    },
  ],
};
