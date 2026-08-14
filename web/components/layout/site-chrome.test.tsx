import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { render, screen, within } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { siteConfig } from '@/lib/siteConfig';

/**
 * Behavioural coverage for the site chrome.
 *
 * The chrome is mounted on every route, so the assertions here are the ones the
 * whole site depends on: the navigation targets come from `siteConfig` rather
 * than from hard-coded copy, the current route is announced with
 * `aria-current="page"` and not by colour alone, the contact address in the
 * footer is the configured one, and the only module opening a client boundary
 * is `header-nav.tsx`, which needs the router's pathname to keep that marking
 * correct across a navigation.
 */

// `usePathname` reads router context, which no provider supplies under test, so
// each test states the route the masthead is being rendered for.
vi.mock('next/navigation', () => ({ usePathname: vi.fn() }));

/** readSibling reads a sibling module's source text so the test can inspect its directives. */
function readSibling(fileName: string): string {
  return readFileSync(
    fileURLToPath(new URL(fileName, import.meta.url)),
    'utf8',
  );
}

/**
 * atRoute renders the masthead as it appears on the given route.
 *
 * @param pathname - the route the router has navigated to.
 */
function atRoute(pathname: string): void {
  vi.mocked(usePathname).mockReturnValue(pathname);
  render(<SiteHeader />);
}

beforeEach(() => {
  vi.mocked(usePathname).mockReturnValue('/');
});

describe('SiteHeader', () => {
  it('renders the wordmark from the site configuration', () => {
    render(<SiteHeader />);

    const banner = screen.getByRole('banner');
    expect(
      within(banner).getByRole('link', { name: new RegExp(siteConfig.name) }),
    ).toHaveAttribute('href', '/');
  });

  it('renders every configured navigation entry with its href', () => {
    render(<SiteHeader />);

    const navigation = screen.getByRole('navigation', { name: /main/i });

    for (const entry of siteConfig.navigation) {
      expect(
        within(navigation).getByRole('link', { name: entry.label }),
      ).toHaveAttribute('href', entry.href);
    }
  });

  it('renders the "Get in touch" action anchored to the contact section', () => {
    render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Get in touch' })).toHaveAttribute(
      'href',
      '/#contact',
    );
  });

  it('marks only the active route with aria-current', () => {
    atRoute('/blog');

    const navigation = screen.getByRole('navigation', { name: /main/i });
    const active = within(navigation).getByRole('link', { name: 'Writing' });

    expect(active).toHaveAttribute('aria-current', 'page');
    expect(
      within(navigation).getByRole('link', { name: 'Home' }),
    ).not.toHaveAttribute('aria-current');
    expect(
      within(navigation).getByRole('link', { name: 'Projects' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks the section entry active for a nested route', () => {
    atRoute('/blog/how-this-site-was-built');

    const navigation = screen.getByRole('navigation', { name: /main/i });

    expect(
      within(navigation).getByRole('link', { name: 'Writing' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(navigation).getByRole('link', { name: 'Home' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks no entry active on a route outside the navigation', () => {
    atRoute('/legal');

    const navigation = screen.getByRole('navigation', { name: /main/i });

    for (const entry of siteConfig.navigation) {
      expect(
        within(navigation).getByRole('link', { name: entry.label }),
      ).not.toHaveAttribute('aria-current');
    }
  });

  it('moves the marking when the router navigates to another section', () => {
    // The regression this guards: the marking used to come from a request
    // header read on the server, and the App Router serves the root segment —
    // the masthead — from a single cache entry shared by every route, so the
    // marking never moved off whichever page the tab first loaded. Reading the
    // pathname from the router is what makes a re-render follow the navigation.
    vi.mocked(usePathname).mockReturnValue('/');
    const { rerender } = render(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Home' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    vi.mocked(usePathname).mockReturnValue('/blog');
    rerender(<SiteHeader />);

    expect(screen.getByRole('link', { name: 'Writing' })).toHaveAttribute(
      'aria-current',
      'page',
    );
    expect(screen.getByRole('link', { name: 'Home' })).not.toHaveAttribute(
      'aria-current',
    );
  });

  it('keeps the masthead shell a server component', () => {
    // Only the navigation opens a client boundary; the banner and the wordmark
    // stay on the server.
    expect(readSibling('./site-header.tsx')).not.toContain('use client');
  });
});

describe('SiteFooter', () => {
  it('renders the configured contact address as a mailto link', () => {
    render(<SiteFooter />);

    expect(
      screen.getByRole('link', { name: siteConfig.email }),
    ).toHaveAttribute('href', `mailto:${siteConfig.email}`);
  });

  it('repeats the configured navigation entries', () => {
    render(<SiteFooter />);

    const navigation = screen.getByRole('navigation', { name: /footer/i });

    for (const entry of siteConfig.navigation) {
      expect(
        within(navigation).getByRole('link', { name: entry.label }),
      ).toHaveAttribute('href', entry.href);
    }
  });

  it('renders the source link only when a repository URL is configured', () => {
    render(<SiteFooter />);

    const sourceLink = screen.queryByRole('link', { name: /source/i });

    if (siteConfig.agentsRepositoryUrl === null) {
      expect(sourceLink).toBeNull();
    } else {
      expect(sourceLink).toHaveAttribute(
        'href',
        siteConfig.agentsRepositoryUrl,
      );
    }
  });

  it('is a server component', () => {
    expect(readSibling('./site-footer.tsx')).not.toContain('use client');
  });
});
