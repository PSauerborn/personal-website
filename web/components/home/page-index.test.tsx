import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { PageIndex } from '@/components/home/page-index';

/**
 * Coverage for the hero's page index (DES-002 option 4).
 *
 * The rows are authored rather than fetched, so the assertions pin the contract
 * the hero depends on: one `navigation` landmark named "On this page", exactly
 * three links to the homepage's three section anchors in page order, and an
 * accessible name per link that is the row's own text with the decorative
 * ordinal left out of it. The source files are read back to prove the index
 * stays a Server Component and that the three anchors it points at exist.
 */
describe('PageIndex', () => {
  const here = dirname(fileURLToPath(import.meta.url));

  /**
   * indexLinks renders the index and returns its three links in DOM order.
   *
   * @returns the links inside the "On this page" navigation landmark.
   */
  function indexLinks(): HTMLElement[] {
    render(<PageIndex />);
    const nav = screen.getByRole('navigation', { name: 'On this page' });

    return within(nav).getAllByRole('link');
  }

  it('renders a navigation landmark named "On this page"', () => {
    render(<PageIndex />);

    expect(
      screen.getByRole('navigation', { name: 'On this page' }),
    ).toBeInTheDocument();
  });

  it('links to the three homepage sections in page order', () => {
    const links = indexLinks();

    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#cv',
      '#agentic-summary',
      '#contact',
    ]);
  });

  it('names each link by its row text and not by the ordinal', () => {
    const links = indexLinks();

    // The two lines of a row are separate elements, so the accessible name is
    // matched with the separator between them left open: whether the name is
    // joined with a space is the accname implementation's business, not this
    // component's.
    expect(links[0]).toHaveAccessibleName(
      /^Professional history\s*Where I have worked, and what with$/,
    );
    expect(links[1]).toHaveAccessibleName(
      /^How this site was built\s*Written by agents, under a spec$/,
    );
    expect(links[2]).toHaveAccessibleName(
      /^Contact\s*Tell me what you are building$/,
    );
  });

  it('hides the ordinals from assistive technology', () => {
    const links = indexLinks();

    links.forEach((link, index) => {
      const ordinal = within(link).getByTestId(
        `page-index-ordinal-${index + 1}`,
      );
      expect(ordinal).toHaveAttribute('aria-hidden', 'true');
      expect(ordinal).toHaveTextContent(`0${index + 1}`);
    });
  });

  it('sets the ordinals in the accent colour of the 32px column', () => {
    const links = indexLinks();

    links.forEach((link, index) => {
      expect(link.className).toContain('grid-cols-[32px_1fr]');
      expect(
        within(link).getByTestId(`page-index-ordinal-${index + 1}`).className,
      ).toContain('text-accent-text');
    });
  });

  it('declares no width or placement of its own', () => {
    // The hero grid owns the column the index sits in, so the landmark carries
    // only what its caller hands it. Anything self-declared here would fight
    // the cell.
    render(<PageIndex className="lg:pt-2" />);

    expect(
      screen.getByRole('navigation', { name: 'On this page' }),
    ).toHaveAttribute('class', 'lg:pt-2');
  });

  it('is a server component', () => {
    const source = readFileSync(resolve(here, 'page-index.tsx'), 'utf8');

    expect(source).not.toContain('use client');
  });

  it('documents its coupling to the homepage section order', () => {
    const source = readFileSync(resolve(here, 'page-index.tsx'), 'utf8');

    expect(source).toMatch(/app\/page\.tsx/);
    expect(source).toMatch(/stale/i);
  });

  /**
   * sectionSources returns each anchor's section component source, keyed by the
   * `href` the index points at it with.
   *
   * @returns the source text of the three sections the index mirrors.
   */
  function sectionSources(): Record<string, string> {
    return {
      '#cv': readFileSync(resolve(here, 'cv-section-explorer.tsx'), 'utf8'),
      '#agentic-summary': readFileSync(
        resolve(here, 'agentic-summary.tsx'),
        'utf8',
      ),
      '#contact': readFileSync(resolve(here, 'contact-form.tsx'), 'utf8'),
    };
  }

  it('points at anchors that exist on the homepage', () => {
    const sources = sectionSources();

    for (const link of indexLinks()) {
      const href = link.getAttribute('href') ?? '';
      expect(sources[href]).toContain(`id="${href.slice(1)}"`);
    }
  });

  it('repeats each section eyebrow and heading verbatim', () => {
    // The rows are hand-maintained copies of the section headings, so nothing
    // but this assertion stops a reworded heading from leaving the index
    // silently stale. It reads the props off the section sources rather than
    // rendering them, because two of the three sections need data to render.
    const sources = sectionSources();

    for (const link of indexLinks()) {
      const href = link.getAttribute('href') ?? '';
      const [title, heading] = [...link.querySelectorAll('span > span')].map(
        (line) => line.textContent ?? '',
      );

      expect(sources[href]).toContain(`eyebrow="${title}"`);
      expect(sources[href]).toContain(`heading="${heading}"`);
    }
  });
});
