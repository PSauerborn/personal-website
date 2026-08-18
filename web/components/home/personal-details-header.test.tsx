import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PersonalDetailsHeader } from '@/components/home/personal-details-header';
import { siteConfig } from '@/lib/siteConfig';

/**
 * Coverage for the homepage personal details masthead (AC-1, REQ-2.1).
 *
 * Every assertion is written against `siteConfig` rather than against literal
 * copy: `phone` currently holds a `TODO(SPEC-003 REQ-2.1)` placeholder that
 * the site owner has yet to replace, and this component must keep rendering
 * the configured values verbatim so that substituting the real string needs no
 * change here. The tests therefore pin the wiring — which field lands where,
 * and the `mailto:`/`tel:` link structure — not the values themselves. The
 * source file is read back to prove the masthead stays a Server Component
 * (REQ-1.6).
 */
/**
 * heroClasses renders the masthead and returns the class list declared on its
 * section element, with Tailwind's arbitrary-value underscores expanded back to
 * the spaces they stand for, so the fold expression can be asserted as the CSS
 * it compiles to.
 *
 * @returns the hero section's class attribute, underscores replaced by spaces.
 */
function heroClasses(): string {
  const { container } = render(<PersonalDetailsHeader />);

  return (container.firstElementChild?.getAttribute('class') ?? '').replaceAll(
    '_',
    ' ',
  );
}

describe('PersonalDetailsHeader', () => {
  it('renders the name from site config as the page heading', () => {
    render(<PersonalDetailsHeader />);

    expect(
      screen.getByRole('heading', { level: 1, name: siteConfig.name }),
    ).toBeInTheDocument();
  });

  it('renders the headline from site config', () => {
    render(<PersonalDetailsHeader />);

    expect(screen.getByText(siteConfig.headline)).toBeInTheDocument();
  });

  it('renders the email as a mailto link', () => {
    render(<PersonalDetailsHeader />);

    const link = screen.getByRole('link', { name: siteConfig.email });
    expect(link).toHaveAttribute('href', `mailto:${siteConfig.email}`);
  });

  it('renders the phone as a tel link', () => {
    render(<PersonalDetailsHeader />);

    const link = screen.getByRole('link', { name: siteConfig.phone });
    expect(link).toHaveAttribute('href', `tel:${siteConfig.phone}`);
  });

  it('renders the GitHub profile as an external link', () => {
    render(<PersonalDetailsHeader />);

    const link = screen.getByRole('link', {
      name: siteConfig.githubUrl.replace(/^https?:\/\//, ''),
    });
    expect(link).toHaveAttribute('href', siteConfig.githubUrl);
    expect(link).toHaveAttribute('rel', 'noreferrer');
  });

  it('labels the contact rail entries', () => {
    render(<PersonalDetailsHeader />);

    expect(screen.getByText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByText(/^phone$/i)).toBeInTheDocument();
    expect(screen.getByText(/^github$/i)).toBeInTheDocument();
  });

  it('renders no availability claim the site owner has not supplied', () => {
    render(<PersonalDetailsHeader />);

    expect(screen.queryByTestId('availability-pill')).toBeNull();
    expect(screen.queryByText(/open to new work/i)).toBeNull();
  });

  it('hard-codes no personal detail from the mockup', () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        'personal-details-header.tsx',
      ),
      'utf8',
    );

    expect(source).not.toContain(siteConfig.name);
    expect(source).not.toContain(siteConfig.email);
    // The DES-001 mockup's placeholder contact values must not appear.
    expect(source).not.toMatch(/\+49|Munich/);
  });

  it('is a server component', () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        'personal-details-header.tsx',
      ),
      'utf8',
    );

    expect(source).not.toMatch(/['"]use client['"]/);
  });
});

/**
 * Coverage for the full-height first fold (AC-1, AC-2, AC-3, AC-16).
 *
 * jsdom computes no layout, so none of this can be asserted as geometry. What
 * is asserted instead is the declared contract: the exact `min-height`
 * expression with both of its subtrahends, the two columns that set the page
 * index beside the name and the lede rather than under them, the fixed step
 * that holds the contact rail against the row above it, and the absence of the
 * two declarations — a fixed `height` and any `overflow` — that would turn a
 * short viewport or a landscape phone from something that scrolls into
 * something that clips.
 */
describe('PersonalDetailsHeader fold', () => {
  it('fills the viewport minus the sticky header and the main padding', () => {
    expect(heroClasses()).toContain(
      'min-h-[calc(100dvh - var(--header-height) - var(--space-8))]',
    );
  });

  it('measures the fold in dvh, never vh, so mobile browser chrome counts', () => {
    expect(heroClasses()).not.toMatch(/(^|[^d])vh/);
  });

  it('declares a minimum height rather than a fixed one', () => {
    const classes = heroClasses();

    expect(classes).not.toMatch(/(^|\s)h-/);
    expect(classes).toMatch(/(^|\s)min-h-/);
  });

  it('declares no overflow, so a short viewport grows and scrolls', () => {
    expect(heroClasses()).not.toContain('overflow');
  });

  it('lays the fold out as a flex column', () => {
    const classes = heroClasses().split(/\s+/);

    expect(classes).toContain('flex');
    expect(classes).toContain('flex-col');
  });

  it('turns the fold into two columns from lg up', () => {
    // One render, not `heroClasses()` plus a second: two copies of the fold in
    // the document make the index ambiguous to query by role.
    const { container } = render(<PersonalDetailsHeader />);
    const hero = container.firstElementChild;
    const columns = [...(hero?.children ?? [])];

    expect(hero).toHaveClass('lg:flex-row');
    // The masthead column first, the index second — so the name and the lede
    // are read before the index, and stack in that order below `lg`.
    expect(columns).toHaveLength(2);
    expect(columns[1]).toBe(
      screen.getByRole('navigation', { name: /on this page/i }),
    );
  });

  it('sets the contact rail directly beneath the name and the lede', () => {
    const { container } = render(<PersonalDetailsHeader />);
    const masthead = container.firstElementChild?.firstElementChild;
    const rail = [...(masthead?.children ?? [])][1];

    expect(masthead).toHaveClass('flex-1');
    expect(rail?.tagName).toBe('DL');
    // A fixed step, not `mt-auto`: an auto margin would swallow the whole
    // slack of the fold and open a gap between the two rows on a tall viewport.
    expect(rail).toHaveClass('mt-8');
    expect(rail?.className).not.toMatch(/(^|\s)mt-auto(\s|$)/);
  });

  it('holds the fold at every breakpoint without a media literal', () => {
    const source = readFileSync(
      resolve(
        dirname(fileURLToPath(import.meta.url)),
        'personal-details-header.tsx',
      ),
      'utf8',
    );

    expect(source).not.toContain('@media');
  });
});
