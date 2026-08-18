import type { ReactNode } from 'react';

/** Props accepted by `SectionHeading`. */
export type SectionHeadingProps = {
  /** Caps eyebrow naming the section, e.g. `Catalogue`. */
  eyebrow: string;
  /** The section heading itself. */
  heading: string;
  /**
   * `id` set on the heading element. Every call site labels its `<section>`
   * with `aria-labelledby`, so this is required rather than optional.
   */
  id: string;
  /** Optional lede paragraph. Omitted entirely rather than rendered empty. */
  lede?: ReactNode;
  /**
   * Heading level. Routes that open with this block use `1`; sections composed
   * into a page that already has an `h1` use the default `2`.
   */
  level?: 1 | 2;
};

/**
 * SectionHeading renders the DES-001 section opener: a caps eyebrow, the
 * heading, and an optional lede held to the lede measure.
 *
 * The eyebrow is the accent colour. It is the site's one repeating mark of
 * colour: a section opener carries it, a field label inside the content
 * (`Inputs`, `Stack`, the footer columns) never does, so a green caps line
 * always means "a new section starts here" rather than "a label". Rank is still
 * carried by size and weight — the colour only says which kind of label it is.
 *
 * The triple was copied verbatim into eight sections across seven files before
 * it was extracted here (`[JS-010]`, `[JS-011]`). The classes are fixed rather
 * than parameterised: the point of the component is that every section opens
 * identically, and a `className` escape hatch would let that drift back apart
 * one call site at a time. Sections that need a different shape — the 404 and
 * error states, the empty state, the `<dt>` labels of the personal details
 * header — keep their own markup rather than being forced through this one.
 *
 * @param eyebrow - caps eyebrow naming the section.
 * @param heading - the heading text.
 * @param id - `id` set on the heading, referenced by the section's
 *   `aria-labelledby`.
 * @param lede - optional lede paragraph; nothing is rendered when it is absent.
 * @param level - heading level, `2` by default.
 * @returns the eyebrow, heading and optional lede, with no wrapper element, so
 *   the caller keeps ownership of its own `<section>` and its spacing.
 */
export function SectionHeading({
  eyebrow,
  heading,
  id,
  lede,
  level = 2,
}: SectionHeadingProps) {
  const Heading = level === 1 ? 'h1' : 'h2';

  return (
    <>
      <p className="text-xs font-semibold tracking-wide text-accent-text uppercase">
        {eyebrow}
      </p>
      <Heading
        id={id}
        className="mt-4 text-3xl font-medium tracking-tight text-text-primary"
      >
        {heading}
      </Heading>
      {lede ? (
        <p className="mt-4 max-w-(--measure-lede) text-base text-text-secondary">
          {lede}
        </p>
      ) : null}
    </>
  );
}
