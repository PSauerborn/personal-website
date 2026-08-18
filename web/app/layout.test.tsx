import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen, within } from '@testing-library/react';
import { usePathname } from 'next/navigation';
import { createContext, useContext, type ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { siteConfig } from '@/lib/siteConfig';

import RootLayout, { metadata } from './layout';
import RootTemplate from './template';

// `next/font/google` is compiled by the Next.js font loader, which Vitest does
// not run: the real module throws when it is called outside a build. The mock
// returns the same shape the loader produces so the layout can be rendered.
vi.mock('next/font/google', () => ({
  Inter: () => ({
    className: 'mock-inter',
    style: { fontFamily: 'Inter' },
    variable: '--font-inter',
  }),
}));

/**
 * Stand-in for the router's pathname context.
 *
 * `usePathname` is mocked onto a real React context rather than onto a function
 * returning a value, because the client-side navigation suite below depends on
 * the propagation behaviour the real hook has: the pathname reaches the
 * masthead through context, so it updates the masthead even when every element
 * above it is identical and React bails out of re-rendering it. A mock that
 * merely returned a new value would leave the marking frozen for a reason the
 * framework does not share, and the suite would fail against correct code.
 */
const PathnameContext = createContext<string>('/');

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

/**
 * atRoute wraps a tree in the pathname the router has navigated to.
 *
 * @param pathname - the current route.
 * @param tree - the tree to render beneath it.
 * @returns the tree, ready to be mounted.
 */
function atRoute(pathname: string, tree: ReactNode): ReactNode {
  return (
    <PathnameContext.Provider value={pathname}>{tree}</PathnameContext.Provider>
  );
}

/**
 * mountTemplateAt renders the root template as the router mounts it for a
 * route, and returns the masthead navigation.
 *
 * @param pathname - the route the router has navigated to.
 * @returns the main navigation element of the mounted masthead.
 */
function mountTemplateAt(pathname: string): HTMLElement {
  render(
    atRoute(pathname, <RootTemplate>{<p>route content</p>}</RootTemplate>),
  );

  return screen.getByRole('navigation', { name: 'Main' });
}

/**
 * markedEntry returns the label of the navigation entry currently announced as
 * the page being viewed.
 *
 * @returns the text of the entry carrying `aria-current="page"`, or null when
 *   no entry is marked.
 */
function markedEntry(): string | null {
  const navigation = screen.getByRole('navigation', { name: 'Main' });
  const marked = within(navigation)
    .getAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'page');

  expect(marked.length).toBeLessThan(2);

  return marked[0]?.textContent ?? null;
}

beforeEach(() => {
  vi.mocked(usePathname).mockImplementation(() => useContext(PathnameContext));
});

/**
 * Module text of the layout and the template. Vitest runs from the application
 * root, and the directive and stylesheet assertions are about the source rather
 * than the transformed module, so the files are read from disk.
 */
const layoutSource = readFileSync(resolve('app/layout.tsx'), 'utf8');
const templateSource = readFileSync(resolve('app/template.tsx'), 'utf8');

describe('RootLayout', () => {
  it('renders what the router mounts inside it', async () => {
    render(await RootLayout({ children: <p>route content</p> }));

    expect(screen.getByText('route content')).toBeInTheDocument();
  });

  it('mounts the site footer beneath the route', async () => {
    render(await RootLayout({ children: <p>route content</p> }));

    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
  });

  it('declares the html shell with an explicit document language', async () => {
    // React renders `<html>` and `<body>` into the real document rather than
    // into the test container, so the shell is asserted on the document.
    render(await RootLayout({ children: <p>route content</p> }));

    expect(document.documentElement).toHaveAttribute('lang', 'en');
    expect(document.body).toContainElement(screen.getByText('route content'));
  });

  it('exports a non-empty title with a template for child routes', () => {
    const { title } = metadata;

    expect(title).toEqual({
      default: expect.stringMatching(/\S/) as unknown as string,
      template: expect.stringContaining('%s') as unknown as string,
    });
  });

  it('exports a non-empty description', () => {
    expect(metadata.description).toEqual(expect.stringMatching(/\S/));
  });

  it('imports the global stylesheet exactly once', () => {
    expect(layoutSource.match(/^import '\.\/globals\.css';$/gm)).toHaveLength(
      1,
    );
  });

  it('carries no client directive, so the shell stays a Server Component', () => {
    expect(layoutSource).not.toContain('use client');
  });
});

describe('RootTemplate', () => {
  it('renders its children inside the single centered content column', () => {
    mountTemplateAt('/');

    const column = screen.getByText('route content').closest('main');

    expect(column).not.toBeNull();
    // `max-w-column` is `--container-column` (1024px); the gutter is the token.
    expect(column).toHaveClass('max-w-column');
    expect(column).toHaveClass('mx-auto');
  });

  it('mounts the site header above the column', () => {
    mountTemplateAt('/');

    expect(screen.getByRole('banner')).toBeInTheDocument();
  });

  it('carries no client directive, so the chrome stays a Server Component', () => {
    expect(templateSource).not.toContain('use client');
  });

  it('reads nothing from the request', () => {
    // The masthead's current-entry marking was once derived from a pathname the
    // proxy stamped onto the request and this template read back. That is stale
    // from the first in-site click onwards: the App Router caches the root
    // segment — this template's output — under one key shared by every route,
    // and a template's unique key remounts that cached output rather than
    // refetching it. Nothing in the chrome may go back to reading the request.
    expect(templateSource).not.toContain('next/headers');
  });
});

describe('navigation marking', () => {
  it('marks the entry of the section being rendered', () => {
    const navigation = mountTemplateAt('/projects');

    expect(
      within(navigation).getByRole('link', { name: 'Projects' }),
    ).toHaveAttribute('aria-current', 'page');
    expect(
      within(navigation).getByRole('link', { name: 'Writing' }),
    ).not.toHaveAttribute('aria-current');
  });

  it('marks Writing on an article route beneath /blog', () => {
    const navigation = mountTemplateAt('/blog/exactly-once');

    expect(
      within(navigation).getByRole('link', { name: 'Writing' }),
    ).toHaveAttribute('aria-current', 'page');

    for (const entry of siteConfig.navigation) {
      if (entry.label !== 'Writing') {
        expect(
          within(navigation).getByRole('link', { name: entry.label }),
        ).not.toHaveAttribute('aria-current');
      }
    }
  });

  it('marks Home only on the root route', () => {
    const navigation = mountTemplateAt('/');

    expect(
      within(navigation).getByRole('link', { name: 'Home' }),
    ).toHaveAttribute('aria-current', 'page');
  });

  it('marks no entry on a route outside the navigation', () => {
    const navigation = mountTemplateAt('/legal');

    for (const entry of siteConfig.navigation) {
      expect(
        within(navigation).getByRole('link', { name: entry.label }),
      ).not.toHaveAttribute('aria-current');
    }
  });
});

describe('navigation marking across a client-side navigation', () => {
  /**
   * The App Router does not re-invoke the root layout on a soft navigation, and
   * — the defect this suite exists for — it does not re-render the root
   * *template* either: the root segment is cached under a key shared by every
   * route, so its server output is fetched once and reused. That is modelled
   * here by computing the layout's output once and handing React the identical
   * element on both renders, while the segment beneath it takes the new route.
   * The marking must still follow the navigation, which it can only do by being
   * computed on the client.
   */
  it('moves the marking onto the section navigated to', async () => {
    const shell = await RootLayout({
      children: <RootTemplate>{<p>route content</p>}</RootTemplate>,
    });

    const { rerender } = render(atRoute('/', shell));

    expect(markedEntry()).toBe('Home');

    // The visitor clicks *Writing* in the masthead. `shell` is the same element
    // object as before — nothing above the page is re-rendered on the server,
    // exactly as the framework behaves — and only the router's pathname moves.
    rerender(atRoute('/blog', shell));

    expect(markedEntry()).toBe('Writing');
  });

  it('leaves no entry marked when navigating to a route outside the navigation', async () => {
    const shell = await RootLayout({
      children: <RootTemplate>{<p>route content</p>}</RootTemplate>,
    });

    const { rerender } = render(atRoute('/blog', shell));

    expect(markedEntry()).toBe('Writing');

    rerender(atRoute('/legal', shell));

    expect(markedEntry()).toBeNull();
  });
});
