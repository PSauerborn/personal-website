import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

import { render, screen } from '@testing-library/react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import {
  ARTICLE_SANITIZE_SCHEMA,
  ArticleContent,
} from '@/components/blog/article-content';

/**
 * Markdown exercising the stored-XSS vectors an article body can carry
 * (RISK-003). Every one of these is authored content that reaches the renderer
 * verbatim from the content endpoint.
 */
const XSS_MARKDOWN = [
  '# Compromised article',
  '',
  '<script>alert(1)</script>',
  '',
  '<img src="x" onerror="alert(1)" />',
  '',
  '<iframe src="https://evil.example.com"></iframe>',
  '',
  '<a href="javascript:alert(1)">click me</a>',
  '',
  '[markdown link](javascript:alert(1))',
  '',
  '<div onclick="alert(1)">handler on a plain element</div>',
].join('\n');

const NORMAL_MARKDOWN = [
  '## What the broker actually guarantees',
  '',
  'The broker guarantees **atomic writes**, and _nothing else_.',
  '',
  '- Transactional offset storage',
  '- Natural idempotency keys',
  '',
  'Use `tx.Commit()` to close the transaction.',
  '',
  '```go',
  'tx := db.Begin()',
  '```',
  '',
  '> Exactly-once is an idempotency property you build.',
  '',
  '[the specification](https://example.com/spec)',
].join('\n');

/**
 * A fenced block with a language the highlighter knows, carrying the same
 * executable markup the sanitiser must strip. Both halves are asserted on the
 * same render: highlighting must not be bought by weakening the barrier.
 */
const HIGHLIGHTED_XSS_MARKDOWN = [
  '```go',
  'func main() { return }',
  '```',
  '',
  '<script>alert(1)</script>',
  '',
  '<img src="x" onerror="alert(1)" />',
  '',
  '[markdown link](javascript:alert(1))',
].join('\n');

const UNLABELLED_FENCE_MARKDOWN = [
  '```',
  'GET /v1/agents  200  13 items  38ms',
  '```',
].join('\n');

const UNKNOWN_LANGUAGE_MARKDOWN = [
  '```notalanguage',
  'nothing here is highlightable',
  '```',
].join('\n');

const EMPTY_FENCE_MARKDOWN = ['```', '```'].join('\n');

/**
 * codeWell returns the chrome wrapper around the rendered `<pre>`, which is
 * where the well background, gutter and language badge live.
 *
 * @param container - the render result's container element the `<pre>` was
 *   rendered into.
 * @returns the element wrapping the rendered `<pre>`.
 * @throws when no `<pre>` was rendered, so there is no well to return.
 */
function codeWell(container: HTMLElement): HTMLElement {
  const pre = container.querySelector('pre');
  const well = pre?.parentElement;

  if (!well) {
    throw new Error('no code well was rendered');
  }

  return well;
}

/** Where `next build` writes everything the browser downloads. */
const CLIENT_BUNDLE_DIR = join(process.cwd(), '.next', 'static');

/**
 * Any trace of the highlighter or a language grammar in browser-bound code.
 * `hljs` covers both the emitted token class names and the library's own
 * identifiers; `lowlight`/`highlight.js` cover the packages `rehype-highlight`
 * pulls in.
 */
const HIGHLIGHTER_PAYLOAD = /hljs|lowlight|highlight\.js/i;

/**
 * clientBundleFiles lists every JavaScript file `next build` emitted into the
 * client bundle directory.
 *
 * It throws rather than returning an empty list when the build output is
 * missing or carries no JavaScript. A boundary check with nothing to scan
 * passes vacuously, which is precisely the false confidence RISK-009 is about:
 * the check must go red and name the command that produces its input.
 *
 * @returns absolute paths of every `.js` file under `web/.next/static`.
 * @throws when the client bundle directory is absent or holds no `.js` file.
 */
function clientBundleFiles(): string[] {
  if (!existsSync(CLIENT_BUNDLE_DIR)) {
    throw new Error(
      `no client bundle at ${CLIENT_BUNDLE_DIR}: run \`npm run build\` from ` +
        'web/ before this suite. This check must fail rather than skip — it ' +
        'asserts what is absent, so it proves nothing without a bundle to scan.',
    );
  }

  const files = readdirSync(CLIENT_BUNDLE_DIR, { recursive: true })
    .map((entry) => String(entry))
    .filter((entry) => entry.endsWith('.js'))
    .map((entry) => join(CLIENT_BUNDLE_DIR, entry));

  if (files.length === 0) {
    throw new Error(
      `no JavaScript under ${CLIENT_BUNDLE_DIR}: the client bundle looks ` +
        'stale or partial. Run `npm run build` from web/ before this suite.',
    );
  }

  return files;
}

describe('ArticleContent', () => {
  describe('sanitization', () => {
    it('renders no script element for embedded script markup', () => {
      const { container } = render(<ArticleContent markdown={XSS_MARKDOWN} />);

      expect(container.querySelector('script')).toBeNull();
      expect(container.innerHTML).not.toContain('alert(1)');
    });

    it('renders no iframe element for embedded frame markup', () => {
      const { container } = render(<ArticleContent markdown={XSS_MARKDOWN} />);

      expect(container.querySelector('iframe')).toBeNull();
    });

    it('strips every event-handler attribute from the rendered tree', () => {
      const { container } = render(<ArticleContent markdown={XSS_MARKDOWN} />);

      const handlers = Array.from(container.querySelectorAll('*')).flatMap(
        (element) =>
          Array.from(element.attributes)
            .map((attribute) => attribute.name)
            .filter((name) => name.toLowerCase().startsWith('on')),
      );

      expect(handlers).toEqual([]);
    });

    it('neutralises javascript: hrefs', () => {
      const { container } = render(<ArticleContent markdown={XSS_MARKDOWN} />);

      const hrefs = Array.from(container.querySelectorAll('a')).map((anchor) =>
        anchor.getAttribute('href'),
      );

      for (const href of hrefs) {
        expect(href ?? '').not.toMatch(/^\s*javascript:/i);
      }
    });

    it('still renders the trusted markdown that surrounds the attack', () => {
      render(<ArticleContent markdown={XSS_MARKDOWN} />);

      expect(
        screen.getByRole('heading', { name: 'Compromised article' }),
      ).toBeInTheDocument();
    });
  });

  describe('ARTICLE_SANITIZE_SCHEMA', () => {
    it('allows no element that can execute or embed', () => {
      const tagNames = ARTICLE_SANITIZE_SCHEMA.tagNames ?? [];

      for (const forbidden of [
        'script',
        'iframe',
        'object',
        'embed',
        'style',
        'input',
      ]) {
        expect(tagNames).not.toContain(forbidden);
      }
      expect(tagNames).toContain('code');
    });

    it('allows no event-handler or style attribute on any element', () => {
      const attributes = Object.values(
        ARTICLE_SANITIZE_SCHEMA.attributes ?? {},
      ).flat();

      const dangerous = attributes.filter((attribute) => {
        const name = typeof attribute === 'string' ? attribute : attribute[0];
        return /^on/i.test(name) || name === 'style';
      });

      expect(dangerous).toEqual([]);
    });

    it('allows only inert protocols in href and src', () => {
      expect(ARTICLE_SANITIZE_SCHEMA.protocols?.href).toEqual([
        'http',
        'https',
        'mailto',
      ]);
      expect(ARTICLE_SANITIZE_SCHEMA.protocols?.src).toEqual(['http', 'https']);
    });
  });

  describe('markdown rendering', () => {
    it('renders headings as heading elements', () => {
      render(<ArticleContent markdown={NORMAL_MARKDOWN} />);

      expect(
        screen.getByRole('heading', {
          level: 2,
          name: 'What the broker actually guarantees',
        }),
      ).toBeInTheDocument();
    });

    it('renders emphasis as strong and emphasis elements', () => {
      const { container } = render(
        <ArticleContent markdown={NORMAL_MARKDOWN} />,
      );

      expect(container.querySelector('strong')).toHaveTextContent(
        'atomic writes',
      );
      expect(container.querySelector('em')).toHaveTextContent('nothing else');
    });

    it('renders list items as a list', () => {
      render(<ArticleContent markdown={NORMAL_MARKDOWN} />);

      const items = screen.getAllByRole('listitem');

      expect(items).toHaveLength(2);
      expect(items[0]).toHaveTextContent('Transactional offset storage');
    });

    it('renders inline code and fenced code blocks', () => {
      const { container } = render(
        <ArticleContent markdown={NORMAL_MARKDOWN} />,
      );

      expect(container.querySelector('code')).toHaveTextContent('tx.Commit()');
      expect(container.querySelector('pre')).toHaveTextContent(
        'tx := db.Begin()',
      );
    });

    it('renders blockquotes', () => {
      const { container } = render(
        <ArticleContent markdown={NORMAL_MARKDOWN} />,
      );

      expect(container.querySelector('blockquote')).toHaveTextContent(
        'Exactly-once is an idempotency property you build.',
      );
    });

    it('renders links with their href intact', () => {
      render(<ArticleContent markdown={NORMAL_MARKDOWN} />);

      expect(
        screen.getByRole('link', { name: 'the specification' }),
      ).toHaveAttribute('href', 'https://example.com/spec');
    });

    it('renders nothing when the article has no content', () => {
      const { container } = render(<ArticleContent markdown="   " />);

      expect(container).toBeEmptyDOMElement();
    });
  });

  describe('syntax highlighting', () => {
    it('emits token markup for a fenced block with a known language', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      const code = container.querySelector('pre > code');

      expect(code).not.toBeNull();
      expect(code?.className).toContain('hljs');
      expect(
        container.querySelectorAll('[class*="hljs-"]').length,
      ).toBeGreaterThan(0);
    });

    it('still strips executable markup from the same article', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      expect(container.querySelector('script')).toBeNull();
      expect(container.innerHTML).not.toContain('alert(1)');

      const handlers = Array.from(container.querySelectorAll('*')).flatMap(
        (element) =>
          Array.from(element.attributes)
            .map((attribute) => attribute.name)
            .filter((name) => name.toLowerCase().startsWith('on')),
      );

      expect(handlers).toEqual([]);

      for (const anchor of Array.from(container.querySelectorAll('a'))) {
        expect(anchor.getAttribute('href') ?? '').not.toMatch(
          /^\s*javascript:/i,
        );
      }
    });

    it('leaves a fence with no language unhighlighted and unbadged', () => {
      const { container } = render(
        <ArticleContent markdown={UNLABELLED_FENCE_MARKDOWN} />,
      );

      const code = container.querySelector('pre > code');

      expect(code).toHaveTextContent('GET /v1/agents');
      expect(code?.className).not.toContain('hljs');
      expect(container.querySelectorAll('[class*="hljs-"]')).toHaveLength(0);
      expect(codeWell(container).querySelector(':scope > span')).toBeNull();
    });

    it('renders a fence with an unrecognised language without highlighting it', () => {
      const { container } = render(
        <ArticleContent markdown={UNKNOWN_LANGUAGE_MARKDOWN} />,
      );

      expect(container.querySelector('pre > code')).toHaveTextContent(
        'nothing here is highlightable',
      );
      expect(container.querySelectorAll('[class*="hljs-"]')).toHaveLength(0);
    });
  });

  describe('code chrome', () => {
    it('keeps the block treatment alongside the highlighter class names', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      const code = container.querySelector('pre > code');

      expect(code?.className).toContain('language-go');
      expect(code?.className).toContain('font-mono');
      expect(code?.className).toContain('[pre>&]:bg-transparent');
      expect(container.querySelector('pre')?.className).toContain(
        'overflow-x-auto',
      );
    });

    it('forces no foreground colour on code inside a block', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      const code = container.querySelector('pre > code');

      expect(code).not.toBeNull();
      expect(code?.className ?? '').not.toContain('[pre>&]:text-');
    });

    it('renders the language badge for a labelled fence', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      expect(
        codeWell(container).querySelector(':scope > span'),
      ).toHaveTextContent('go');
    });

    it('seats the language badge above the code rather than over it', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      const badge = codeWell(container).querySelector(':scope > span');
      const pre = container.querySelector('pre');

      // The chip is a sibling ahead of the scroller, not an overlay: an
      // absolutely positioned chip sits outside `overflow-x-auto` and can hide
      // the end of a long first line at every scroll position.
      expect(badge?.nextElementSibling).toBe(pre);
      expect(badge?.className).not.toContain('absolute');
      expect(codeWell(container).className).not.toContain('relative');
    });

    it('renders the language badge as the Badge primitive', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      const badge = codeWell(container).querySelector(':scope > span');

      expect(badge).toHaveAttribute('data-slot', 'badge');
      expect(badge?.className).toContain('font-mono');
    });

    it('reserves the badge strip only on a labelled fence', () => {
      const labelled = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );
      const unlabelled = render(
        <ArticleContent markdown={UNLABELLED_FENCE_MARKDOWN} />,
      );

      const labelledPre = labelled.container.querySelector('pre');
      const unlabelledPre = unlabelled.container.querySelector('pre');

      expect(unlabelledPre?.className).toContain('py-(--space-4)');
      expect(labelledPre?.className).not.toContain('py-(--space-4)');
      expect(labelledPre?.className).toContain('pt-(--space-2)');
    });

    it('scrolls the block horizontally rather than the body', () => {
      const { container } = render(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      expect(container.querySelector('pre')?.className).toContain(
        'overflow-x-auto',
      );
      expect(codeWell(container).className).toContain('overflow-hidden');
    });

    it('gives an empty fence a floor so the well cannot collapse', () => {
      const { container } = render(
        <ArticleContent markdown={EMPTY_FENCE_MARKDOWN} />,
      );

      expect(container.querySelector('pre')?.className).toContain('min-h-');
    });

    it('keeps the accent-tint chip on inline code', () => {
      const { container } = render(
        <ArticleContent markdown={NORMAL_MARKDOWN} />,
      );

      const inline = container.querySelector('p > code');

      expect(inline?.className).toContain('bg-accent-tint');
      expect(inline?.className).toContain('text-accent-text');
    });
  });

  describe('article measure', () => {
    it('reads the shared article measure and the long-form body type', () => {
      const { container } = render(
        <ArticleContent markdown={NORMAL_MARKDOWN} />,
      );

      const wrapper = container.firstElementChild;

      expect(wrapper?.className).toContain('max-w-(--measure-article)');
      expect(wrapper?.className).toContain('text-lg');
      expect(wrapper?.className).toContain('leading-prose');
      expect(container.querySelector('p')?.className).toContain(
        'mb-(--space-6)',
      );
    });

    it('is a Server Component, so no highlighter reaches the client bundle', () => {
      const source = readFileSync(
        join(process.cwd(), 'components/blog/article-content.tsx'),
        'utf8',
      );

      expect(source).not.toContain('use client');
      expect(source).not.toContain('dangerouslySetInnerHTML=');
    });
  });

  describe('client boundary', () => {
    /**
     * The evidence half of RISK-009. The source-text check above is a
     * convention check: it reads one file and would still pass if a client
     * component imported `ArticleContent` or `ARTICLE_SANITIZE_SCHEMA` and
     * dragged `lowlight`/`highlight.js` across the boundary from the other
     * side. This reads what the browser is actually served, so it goes red for
     * that failure mode however it is introduced.
     */
    it('ships no highlighter payload in the built client bundle', () => {
      const offenders = clientBundleFiles()
        .filter((file) => HIGHLIGHTER_PAYLOAD.test(readFileSync(file, 'utf8')))
        .map((file) => relative(process.cwd(), file));

      expect(offenders).toEqual([]);
    });

    /**
     * The other half: highlighting must be in the server payload, not applied
     * by browser JavaScript. The jsdom tests above assert on a tree React built
     * client-side, which says nothing about what a reader with JavaScript
     * disabled receives (AC-15). This asserts on the raw HTML string a server
     * render produces, with no client runtime involved at all.
     */
    it('server-renders the highlighted markup with no client javascript', () => {
      const markup = renderToStaticMarkup(
        <ArticleContent markdown={HIGHLIGHTED_XSS_MARKDOWN} />,
      );

      expect(markup).toMatch(/class="[^"]*\bhljs\b/);
      expect(markup).toMatch(/class="hljs-[\w-]+"/);
      expect(markup).toContain('<span class="hljs-keyword">func</span>');
      // The same server payload must still carry no executable markup.
      expect(markup).not.toContain('alert(1)');
    });
  });
});
