/**
 * DS-004-CV — Option 3: Skill-Filtered Explorer
 *
 * Treats the CV as a small application rather than a document. Headline skills
 * double as filter controls; selecting one narrows the role list to the roles
 * that used it. Roles are a master list beside a sticky detail panel.
 *
 * Client component. Every experience and education entry is rendered into the
 * DOM on the server and hidden with the `hidden` attribute rather than being
 * conditionally mounted, so filtering never removes content from the
 * server-rendered HTML (SPEC-004 REQ-1.1).
 */

"use client";

import { useMemo, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import {
  type CV,
  type EducationEntry,
  type ExperienceEntry,
  formatDuration,
  formatMonth,
  formatRange,
  isCurrent,
} from "@/lib/cv-data";

// ---------------------------------------------------------------------------
// 1 — Headline skills, doubling as filters
// ---------------------------------------------------------------------------

function SkillFilters({
  skills,
  selected,
  onToggle,
  usable,
}: {
  skills: CV["skills"];
  selected: string | null;
  onToggle: (skill: string) => void;
  /** Skills that appear in at least one experience entry; others are display-only. */
  usable: Set<string>;
}) {
  const categories = Object.entries(skills);

  if (categories.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__title">No skills listed yet</p>
        <p className="empty-state__body">
          Headline skills appear here once tech stack items are mapped to a
          category.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {categories.map(([category, items]) => (
        <div
          key={category}
          className="grid gap-2 sm:grid-cols-[160px_1fr] sm:items-start sm:gap-6"
        >
          <p className="label-caps sm:pt-2">{category}</p>
          <div className="flex flex-wrap gap-2">
            {items.map((item) => {
              const filterable = usable.has(item);
              const active = selected === item;

              return (
                <Toggle
                  key={item}
                  size="sm"
                  pressed={active}
                  onPressedChange={() => filterable && onToggle(item)}
                  disabled={!filterable}
                  aria-label={
                    filterable
                      ? `Filter roles by ${item}`
                      : `${item} — no linked roles`
                  }
                  className={[
                    "h-8 rounded-md px-2.5 text-[13px] font-medium transition-colors",
                    "data-[state=off]:bg-surface data-[state=off]:text-foreground data-[state=off]:hairline",
                    "data-[state=on]:bg-brand data-[state=on]:text-primary-foreground",
                    "disabled:cursor-default disabled:opacity-100",
                    filterable
                      ? "hover:bg-surface-hover"
                      : "text-muted-foreground",
                  ].join(" ")}
                >
                  {item}
                </Toggle>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 2 — Master list
// ---------------------------------------------------------------------------

function RoleListItem({
  entry,
  active,
  hidden,
  onSelect,
}: {
  entry: ExperienceEntry;
  active: boolean;
  hidden: boolean;
  onSelect: () => void;
}) {
  return (
    <li hidden={hidden}>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={[
          "w-full rounded-lg px-4 py-3 text-left transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring",
          active
            ? "bg-card hairline"
            : "hover:bg-accent",
        ].join(" ")}
      >
        <div className="flex items-baseline justify-between gap-3">
          <span
            className={`text-sm font-medium tracking-[-0.012em] ${
              active ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {entry.job_title}
          </span>
          {isCurrent(entry) && (
            <span
              className="size-1.5 shrink-0 rounded-full bg-success"
              aria-label="Current role"
            />
          )}
        </div>
        <span className="mt-0.5 block text-xs text-tertiary">
          {entry.organization}
        </span>
        <span className="mt-1 block text-xs tabular-nums text-tertiary">
          {formatRange(entry.start_date, entry.end_date)}
        </span>
      </button>
    </li>
  );
}

// ---------------------------------------------------------------------------
// 3 — Detail panel
// ---------------------------------------------------------------------------

function RoleDetail({
  entry,
  hidden,
  highlight,
}: {
  entry: ExperienceEntry;
  hidden: boolean;
  /** The active skill filter, emphasised within the stack list. */
  highlight: string | null;
}) {
  return (
    <article hidden={hidden} className="rounded-xl bg-card p-6 hairline">
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs tabular-nums text-tertiary">
        <time dateTime={entry.start_date}>
          {formatRange(entry.start_date, entry.end_date)}
        </time>
        <span aria-hidden="true">·</span>
        <span>{formatDuration(entry.start_date, entry.end_date)}</span>
        {isCurrent(entry) && (
          <Badge
            variant="outline"
            className="h-5 border-0 bg-brand/12 px-2 text-[11px] font-medium text-brand-text"
          >
            Current
          </Badge>
        )}
      </div>

      <h4 className="text-xl font-medium tracking-[-0.012em] text-foreground">
        {entry.job_title}
      </h4>
      <p className="mt-1 text-sm text-muted-foreground">{entry.organization}</p>

      <p className="mt-5 max-w-[65ch] text-sm leading-relaxed text-muted-foreground">
        {entry.description}
      </p>

      <div className="mt-6">
        <p className="label-caps mb-3">Stack</p>
        <ul className="flex flex-wrap gap-2" aria-label="Technologies used">
          {entry.tech_stack.map((tech) => {
            const isHighlighted = highlight === tech;
            return (
              <li key={tech}>
                <Badge
                  variant="secondary"
                  className={[
                    "h-6 rounded-md border-0 px-2 text-xs font-medium",
                    isHighlighted
                      ? "bg-brand/15 text-brand-text"
                      : "bg-surface-hover text-muted-foreground hairline",
                  ].join(" ")}
                >
                  {tech}
                </Badge>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}

// ---------------------------------------------------------------------------
// 4 — Education
// ---------------------------------------------------------------------------

function EducationList({ entries }: { entries: EducationEntry[] }) {
  if (entries.length === 0) {
    return (
      <div className="empty-state">
        <p className="empty-state__title">No education entries yet</p>
        <p className="empty-state__body">
          Qualifications appear here as they are added to the CV.
        </p>
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2" aria-label="Education, most recent first">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-lg bg-card p-5 hairline">
          <p className="text-xs tabular-nums text-tertiary">
            <time dateTime={entry.start_date}>
              {formatMonth(entry.start_date)} —{" "}
              {entry.end_date ? formatMonth(entry.end_date) : "Present"}
            </time>
          </p>
          <h4 className="mt-2 text-base font-medium tracking-[-0.012em] text-foreground">
            {entry.certificate}
          </h4>
          <p className="mt-1 text-sm text-muted-foreground">{entry.institution}</p>
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Section
// ---------------------------------------------------------------------------

export function CVSectionExplorer({ cv }: { cv: CV }) {
  const [filter, setFilter] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string>(
    cv.experience[0]?.id ?? "",
  );

  /** Only stack items that actually appear on a role can act as a filter. */
  const usableSkills = useMemo(
    () => new Set(cv.experience.flatMap((e) => e.tech_stack)),
    [cv.experience],
  );

  const matches = useMemo(
    () =>
      filter === null
        ? cv.experience
        : cv.experience.filter((e) => e.tech_stack.includes(filter)),
    [cv.experience, filter],
  );

  const matchIds = useMemo(() => new Set(matches.map((e) => e.id)), [matches]);

  /** Selecting a filter that excludes the open role moves selection to the first match. */
  function handleToggleFilter(skill: string) {
    const next = filter === skill ? null : skill;
    setFilter(next);

    const nextMatches =
      next === null
        ? cv.experience
        : cv.experience.filter((e) => e.tech_stack.includes(next));

    if (!nextMatches.some((e) => e.id === selectedId) && nextMatches[0]) {
      setSelectedId(nextMatches[0].id);
    }
  }

  return (
    <section id="cv" className="section section--ruled">
      <div className="section__inner">
        <p className="section__label">Curriculum vitae</p>
        <h2 className="section__title">Ten years building backend platforms</h2>
        <p className="section__lede">
          Pick a skill to see only the roles where I used it.
        </p>

        {/* 1 — Headline skills as filters */}
        <div className="mb-12">
          <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-border pb-3">
            <h3 className="label-caps">Headline skills</h3>
            {filter && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFilter(null)}
                className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
              >
                Clear filter
              </Button>
            )}
          </div>
          <SkillFilters
            skills={cv.skills}
            selected={filter}
            onToggle={handleToggleFilter}
            usable={usableSkills}
          />
        </div>

        {/* 2 & 3 — Experience / Education */}
        <Tabs defaultValue="experience">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border pb-3">
            <TabsList className="h-8 gap-1 bg-transparent p-0">
              <TabsTrigger
                value="experience"
                className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Experience
              </TabsTrigger>
              <TabsTrigger
                value="education"
                className="h-8 rounded-md px-3 text-xs font-medium text-muted-foreground data-[state=active]:bg-accent data-[state=active]:text-foreground data-[state=active]:shadow-none"
              >
                Education
              </TabsTrigger>
            </TabsList>

            <p className="text-xs tabular-nums text-tertiary" role="status">
              {filter
                ? `${matches.length} of ${cv.experience.length} roles used ${filter}`
                : `${cv.experience.length} roles`}
            </p>
          </div>

          <TabsContent value="experience" className="mt-0">
            {cv.experience.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">No experience entries yet</p>
                <p className="empty-state__body">
                  Roles appear here as they are added to the CV.
                </p>
              </div>
            ) : matches.length === 0 ? (
              <div className="empty-state">
                <p className="empty-state__title">No roles used {filter}</p>
                <p className="empty-state__body">
                  Clear the filter to see the full history.
                </p>
                <Button
                  variant="secondary"
                  size="sm"
                  className="empty-state__action"
                  onClick={() => setFilter(null)}
                >
                  Clear filter
                </Button>
              </div>
            ) : (
              <div className="grid gap-6 lg:grid-cols-[280px_1fr] lg:gap-8">
                {/* Master */}
                <ul
                  className="flex flex-col gap-1 lg:sticky lg:top-24 lg:self-start"
                  aria-label="Roles, most recent first"
                >
                  {cv.experience.map((entry) => (
                    <RoleListItem
                      key={entry.id}
                      entry={entry}
                      active={entry.id === selectedId}
                      hidden={!matchIds.has(entry.id)}
                      onSelect={() => setSelectedId(entry.id)}
                    />
                  ))}
                </ul>

                {/* Detail — all panels rendered, non-selected ones hidden */}
                <div>
                  {cv.experience.map((entry) => (
                    <RoleDetail
                      key={entry.id}
                      entry={entry}
                      hidden={entry.id !== selectedId}
                      highlight={filter}
                    />
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="education" className="mt-0">
            <EducationList entries={cv.education} />
          </TabsContent>
        </Tabs>
      </div>
    </section>
  );
}
