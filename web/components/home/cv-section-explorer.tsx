'use client';

import { useMemo, useState } from 'react';

import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { SectionHeading } from '@/components/ui/section-heading';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Toggle } from '@/components/ui/toggle';
import type {
  CVEducation,
  CVExperience,
  CVResponse,
  CVSkills,
} from '@/lib/api/types';
import { cn, formatDate } from '@/lib/utils';

/** Rendered in place of an `end_date` that is null, for a role still held. */
const OPEN_ENDED = 'Current';

/** Props accepted by `CVSectionExplorer`. */
export type CVSectionExplorerProps = {
  /**
   * The CV, read on the server by `app/page.tsx`. This island never fetches:
   * the whole CV must be in the first response to stay crawlable (REQ-1.5).
   */
  cv: CVResponse;
};

/**
 * visibleExperienceIds returns the ids of the experience entries that survive
 * the current skill filter.
 *
 * The comparison is case-insensitive and trims both sides, because a skill in
 * the `skills` map and the same skill in a role's `tech_stack` are two separate
 * strings in the database and only agree by convention. A null skill means no
 * filter is applied and every entry is visible.
 *
 * @param entries - the experience entries of the CV, in API order.
 * @param skill - the selected skill, or null when no chip is pressed.
 * @returns the set of ids to leave visible; every other entry stays in the DOM
 *   under the `hidden` attribute.
 */
export function visibleExperienceIds(
  entries: readonly CVExperience[],
  skill: string | null,
): Set<string> {
  if (skill === null) {
    return new Set(entries.map((entry) => entry.id));
  }

  const wanted = skill.trim().toLowerCase();

  return new Set(
    entries
      .filter((entry) =>
        entry.tech_stack.some((item) => item.trim().toLowerCase() === wanted),
      )
      .map((entry) => entry.id),
  );
}

/**
 * countLabel renders the result counter announced by the `role="status"`
 * region: the plain total while nothing is filtered, and the hit count against
 * that total once a skill is pressed.
 *
 * @param visible - number of entries currently visible.
 * @param total - number of entries in the CV.
 * @param skill - the selected skill, or null when no chip is pressed.
 * @returns the sentence to announce.
 */
function countLabel(
  visible: number,
  total: number,
  skill: string | null,
): string {
  const noun = total === 1 ? 'role' : 'roles';

  return skill === null
    ? `${total} ${noun}`
    : `${visible} of ${total} ${noun} used ${skill}`;
}

/**
 * dateRange renders the start and end of a CV entry as one range, using the
 * deterministic formatter so the server markup and its hydration agree.
 *
 * @param start - ISO8601 start timestamp.
 * @param end - ISO8601 end timestamp, or null while the entry is open-ended.
 * @returns the formatted range; an open-ended range ends in `Current`.
 */
function dateRange(start: string, end: string | null): string {
  return `${formatDate(start)} — ${formatDate(end, OPEN_ENDED)}`;
}

/**
 * SkillFilterBar renders the headline skills as filter chips, grouped by the
 * category they are keyed under.
 *
 * The chips are the section's own control surface, so they carry `aria-pressed`
 * (driven by Radix from `pressed`) and change background *and* text colour when
 * pressed. Pressing the active chip again releases the filter.
 *
 * @param skills - the tech stack grouped by category.
 * @param active - the pressed skill, or null when none is.
 * @param onToggle - called with the skill that was pressed or released.
 * @returns the filter bar element.
 */
function SkillFilterBar({
  skills,
  active,
  onToggle,
}: {
  skills: CVSkills;
  active: string | null;
  onToggle: (skill: string | null) => void;
}) {
  return (
    <div data-testid="cv-skill-filters" className="mt-6">
      {Object.entries(skills).map(([category, items]) => (
        <div
          key={category}
          className="grid gap-3 border-t border-border-subtle py-4 sm:grid-cols-[160px_1fr] sm:gap-5"
        >
          <span className="pt-1 text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            {category}
          </span>
          <div className="flex flex-wrap gap-2">
            {items.map((skill) => (
              <Toggle
                key={`${category}-${skill}`}
                pressed={active === skill}
                onPressedChange={(pressed) => onToggle(pressed ? skill : null)}
              >
                {skill}
              </Toggle>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * ExperienceDetail renders the selected role: its range, title, organization,
 * description, responsibilities and stack.
 *
 * @param entry - the selected experience entry, or null when the filter leaves
 *   nothing selected.
 * @param activeSkill - the pressed skill, so the matching stack token can be
 *   marked as the hit that filtered the list.
 * @returns the detail panel element.
 */
function ExperienceDetail({
  entry,
  activeSkill,
}: {
  entry: CVExperience | null;
  activeSkill: string | null;
}) {
  if (entry === null) {
    return (
      <div data-testid="cv-experience-detail">
        <EmptyState
          label="Experience"
          statement="No role used that skill"
          description="Release the skill chip to see the full history again."
        />
      </div>
    );
  }

  const wanted = activeSkill?.trim().toLowerCase() ?? null;

  return (
    <div data-testid="cv-experience-detail">
      <p className="flex flex-wrap items-center gap-2 text-xs text-text-tertiary">
        <span>{dateRange(entry.start_date, entry.end_date)}</span>
        {entry.end_date === null ? (
          <Badge variant="success">{OPEN_ENDED}</Badge>
        ) : null}
      </p>
      <h3 className="mt-3 text-xl font-medium tracking-tight text-text-primary">
        {entry.job_title}
      </h3>
      <p className="mt-1 text-sm text-text-secondary">{entry.organization}</p>
      <p className="mt-4 max-w-(--measure-prose) text-base text-text-secondary">
        {entry.description}
      </p>

      {entry.responsibilities.length > 0 ? (
        <ul className="mt-4 flex max-w-(--measure-prose) flex-col gap-2">
          {entry.responsibilities.map((responsibility) => (
            <li
              key={responsibility}
              className="text-sm text-text-secondary before:mr-2 before:text-accent-text before:content-['—']"
            >
              {responsibility}
            </li>
          ))}
        </ul>
      ) : null}

      {entry.tech_stack.length > 0 ? (
        <div className="mt-6">
          <p className="text-xs font-semibold tracking-wide text-text-tertiary uppercase">
            Stack
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {entry.tech_stack.map((item) => (
              <Badge
                key={item}
                variant={
                  wanted !== null && item.trim().toLowerCase() === wanted
                    ? 'accent'
                    : 'neutral'
                }
              >
                {item}
              </Badge>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * EducationTimeline renders the education entries as ruled rows.
 *
 * Education carries no stack, so the skill filter does not apply to it and
 * every entry stays visible however the chips are set.
 *
 * @param entries - the education entries of the CV, most recent first.
 * @returns the education timeline element.
 */
function EducationTimeline({ entries }: { entries: readonly CVEducation[] }) {
  if (entries.length === 0) {
    return (
      <div data-testid="cv-education-timeline">
        <EmptyState
          label="Education"
          statement="No education entries yet"
          description="The experience timeline covers the work history in the meantime."
        />
      </div>
    );
  }

  return (
    <div data-testid="cv-education-timeline">
      {entries.map((entry) => (
        <div
          key={entry.id}
          data-testid={`cv-education-row-${entry.id}`}
          className="grid gap-1 border-b border-border-subtle py-5 sm:grid-cols-[1fr_auto] sm:items-baseline sm:gap-5"
        >
          <div>
            <h3 className="text-base font-medium text-text-primary">
              {entry.certificate}
            </h3>
            <p className="mt-1 text-sm text-text-secondary">
              {entry.institution}
            </p>
          </div>
          <p className="text-xs text-text-tertiary">
            {dateRange(entry.start_date, entry.end_date)}
          </p>
        </div>
      ))}
    </div>
  );
}

/**
 * CVSectionExplorer renders the homepage CV section (REQ-2.2, AC-2): the
 * headline skills first, then the experience timeline, then the education
 * timeline.
 *
 * It is one of the four client islands the design allows, and it owns nothing
 * but view state — the pressed skill chip and the selected role. The CV itself
 * is read on the server by `app/page.tsx` and handed in as a prop, so the whole
 * history is in the first response and no browser fetch stands between a
 * crawler and the content (REQ-1.5).
 *
 * Filtering never removes a role from the payload: every entry is rendered and
 * the ones that do not match the pressed chip are hidden with the `hidden`
 * attribute, which also keeps the server markup and its hydration identical.
 * The result count is announced through a `role="status"` region rather than
 * left to be noticed. An empty `skills` map suppresses the filter bar entirely
 * while both timelines still render.
 *
 * @param cv - the CV read on the server.
 * @returns the CV section element.
 */
export function CVSectionExplorer({ cv }: CVSectionExplorerProps) {
  const [activeSkill, setActiveSkill] = useState<string | null>(null);
  const [pickedId, setPickedId] = useState<string | null>(null);
  // The tab is controlled rather than left to Radix, because the role counter
  // and the clear-filter action beside the strip describe the experience
  // timeline alone: on the education panel they would be reporting a count for
  // something that is no longer on screen.
  const [tab, setTab] = useState<'experience' | 'education'>('experience');

  const visible = useMemo(
    () => visibleExperienceIds(cv.experience, activeSkill),
    [cv.experience, activeSkill],
  );

  // The selection is derived rather than corrected in an effect: a role that
  // the current filter hides cannot stay selected, so the first visible role
  // takes over until the visitor picks another.
  const selectedId =
    pickedId !== null && visible.has(pickedId)
      ? pickedId
      : (cv.experience.find((entry) => visible.has(entry.id))?.id ?? null);

  const selected =
    cv.experience.find((entry) => entry.id === selectedId) ?? null;

  const hasSkills = Object.keys(cv.skills).length > 0;

  return (
    <section
      id="cv"
      aria-labelledby="cv-heading"
      data-slot="cv-section-explorer"
    >
      <SectionHeading
        id="cv-heading"
        eyebrow="Professional history"
        heading="Where I have worked, and what with"
        // The lede describes the skill filter, so it is withheld when there are
        // no skills to filter on and the filter bar is not rendered either.
        lede={
          hasSkills
            ? 'Pick a skill to see only the roles where I used it. Nothing is removed from the page — the roles that do not match step aside.'
            : undefined
        }
      />

      <div data-cv-block="skills">
        {hasSkills ? (
          <SkillFilterBar
            skills={cv.skills}
            active={activeSkill}
            onToggle={(skill) => setActiveSkill(skill)}
          />
        ) : null}
      </div>

      <Tabs
        value={tab}
        onValueChange={(next) => setTab(next as 'experience' | 'education')}
        className="mt-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <TabsList>
            <TabsTrigger value="experience">Experience</TabsTrigger>
            <TabsTrigger value="education">Education</TabsTrigger>
          </TabsList>
          {tab === 'experience' ? (
            <p className="flex items-center gap-3 text-xs text-text-tertiary">
              <span role="status">
                {countLabel(visible.size, cv.experience.length, activeSkill)}
              </span>
              {activeSkill !== null ? (
                <button
                  type="button"
                  onClick={() => setActiveSkill(null)}
                  className="font-medium text-accent-text transition-colors duration-(--duration-fast) hover:text-accent-bright"
                >
                  Clear filter
                </button>
              ) : null}
            </p>
          ) : null}
        </div>

        <TabsContent
          value="experience"
          forceMount
          data-cv-block="experience"
          className="pt-6"
        >
          {cv.experience.length === 0 ? (
            <EmptyState
              label="Experience"
              statement="No experience entries yet"
              description="The work history will appear here as soon as it is published."
            />
          ) : (
            <div className="grid gap-6 md:grid-cols-[280px_1fr] md:gap-8">
              {/* Same rule as the blog and project ledgers: the column bleeds
                  12px outward and its rows pad the same 12px back in, so the
                  selected row's background has breathing room without the
                  titles drifting off the section's left edge. */}
              <div className="-mx-3 flex flex-col">
                {cv.experience.map((entry) => {
                  const isSelected = entry.id === selectedId;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      data-testid={`cv-experience-row-${entry.id}`}
                      hidden={!visible.has(entry.id)}
                      aria-current={isSelected ? 'true' : undefined}
                      onClick={() => setPickedId(entry.id)}
                      className={cn(
                        // The horizontal padding is the selected row's
                        // breathing room: without it the label sits flush
                        // against the left edge of its own background block.
                        // It is paid back by the `-mx-3` on the column above.
                        'border-b border-border-subtle px-3 py-4 text-left',
                        'transition-colors duration-(--duration-fast)',
                        // The selected row is marked by an accent rule down its
                        // left edge, drawn as an inset ring like every other
                        // rule in the design: a real border would shift the
                        // row's text by its own width on every selection.
                        isSelected
                          ? 'bg-surface-active shadow-[inset_2px_0_0_0_var(--color-accent-text)]'
                          : 'hover:bg-surface-hover',
                      )}
                    >
                      <span
                        className={cn(
                          'block text-sm font-medium',
                          isSelected
                            ? 'text-text-primary'
                            : 'text-text-secondary',
                        )}
                      >
                        {entry.job_title}
                      </span>
                      <span className="mt-1 block text-sm text-text-secondary">
                        {entry.organization}
                      </span>
                      <span className="mt-1 block text-xs text-text-tertiary">
                        {dateRange(entry.start_date, entry.end_date)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <ExperienceDetail entry={selected} activeSkill={activeSkill} />
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="education"
          forceMount
          data-cv-block="education"
          className="pt-6"
        >
          <EducationTimeline entries={cv.education} />
        </TabsContent>
      </Tabs>
    </section>
  );
}
