import type { ComponentPropsWithoutRef, ReactNode } from 'react';
import { Children, isValidElement } from 'react';
import Markdown from 'react-markdown';
import rehypeHighlight from 'rehype-highlight';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import type { Options as SanitizeSchema } from 'rehype-sanitize';

import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * ARTICLE_SANITIZE_SCHEMA is the allow-list applied to every piece of authored
 * markdown rendered by the site. It is deliberately narrower than the
 * `rehype-sanitize` default: no `iframe`, no `style` attributes, and only the
 * `className` hook the syntax-highlighting convention needs.
 *
 * It is exported so the spec-document renderer can reuse the identical barrier
 * rather than re-deriving one — the two surfaces render text from the same API
 * and must not diverge in what they permit.
 */
export const ARTICLE_SANITIZE_SCHEMA: SanitizeSchema = {
  ...defaultSchema,
  tagNames: (defaultSchema.tagNames ?? []).filter(
    (tagName) => tagName !== 'input',
  ),
  attributes: {
    ...defaultSchema.attributes,
    '*': [...(defaultSchema.attributes?.['*'] ?? []), 'className'],
  },
  // Only these protocols may appear in an `href`/`src`; `javascript:` and
  // `data:` are dropped, leaving the attribute absent rather than executable.
  protocols: {
    ...defaultSchema.protocols,
    href: ['http', 'https', 'mailto'],
    src: ['http', 'https'],
  },
};

/**
 * fenceLanguage reads the fence's language off the `<code>` element markdown
 * puts inside every `<pre>`, which carries it as `language-<name>`. An
 * unlabelled fence has no such class, and the language badge is then omitted
 * rather than rendered empty.
 *
 * @param children - the rendered children of a `<pre>` element.
 * @returns the fence's language, or `null` when the fence is unlabelled.
 */
function fenceLanguage(children: ReactNode): string | null {
  for (const child of Children.toArray(children)) {
    if (!isValidElement<{ className?: string }>(child)) {
      continue;
    }

    const match = /(?:^|\s)language-([\w+#.-]+)/.exec(
      child.props.className ?? '',
    );

    if (match) {
      return match[1];
    }
  }

  return null;
}

/**
 * Element overrides applying the "Broadsheet" prose treatment from DES-001.
 * Every value is a `globals.css` token: the measure, leading and type scale for
 * the body, the accent tint for inline code, the soft hairline for code blocks
 * and the em-dash marker that replaces the browser's list bullet.
 */
const PROSE_COMPONENTS = {
  h1: (props: ComponentPropsWithoutRef<'h1'>) => (
    <h1
      className="mt-12 mb-4 text-3xl font-medium tracking-tight text-text-primary"
      {...props}
    />
  ),
  h2: (props: ComponentPropsWithoutRef<'h2'>) => (
    <h2
      className="mt-12 mb-4 text-2xl font-medium tracking-tight text-text-primary"
      {...props}
    />
  ),
  h3: (props: ComponentPropsWithoutRef<'h3'>) => (
    <h3
      className="mt-8 mb-3 text-xl font-medium tracking-tight text-text-primary"
      {...props}
    />
  ),
  p: (props: ComponentPropsWithoutRef<'p'>) => (
    <p className="mb-(--space-6)" {...props} />
  ),
  strong: (props: ComponentPropsWithoutRef<'strong'>) => (
    <strong className="font-medium text-text-primary" {...props} />
  ),
  a: (props: ComponentPropsWithoutRef<'a'>) => (
    <a
      className="text-accent-text underline underline-offset-2 transition-colors duration-(--duration-fast) hover:text-accent-bright"
      {...props}
    />
  ),
  ul: (props: ComponentPropsWithoutRef<'ul'>) => (
    <ul className="mb-6 grid list-none gap-3 pl-0" {...props} />
  ),
  ol: (props: ComponentPropsWithoutRef<'ol'>) => (
    <ol className="mb-6 grid list-decimal gap-3 pl-6" {...props} />
  ),
  li: (props: ComponentPropsWithoutRef<'li'>) => (
    <li
      className="gap-3 before:text-accent-text [ul>&]:flex [ul>&]:before:content-['—']"
      {...props}
    />
  ),
  blockquote: (props: ComponentPropsWithoutRef<'blockquote'>) => (
    <blockquote
      className="my-8 border-l-2 border-accent-text pl-6 text-text-secondary"
      {...props}
    />
  ),
  /**
   * pre renders a fenced code block as a wrapped, scroll-contained well: the
   * `<pre>` keeps the markdown classes it arrived with plus the code-block
   * treatment, and the optional language badge sits in a strip of its own above
   * the code.
   *
   * The badge is a sibling ahead of the `<pre>` rather than an overlay on it.
   * An absolutely positioned chip is outside the `overflow-x-auto` scroller, so
   * it does not move when the reader scrolls a long line horizontally and can
   * permanently cover the end of the first line; reserving the strip costs one
   * row of height and can hide nothing. The `<pre>` therefore carries its top
   * padding conditionally: the strip already supplies the space above a
   * labelled fence.
   *
   * @param className - the class list markdown put on the `<pre>`, merged with
   *   the block treatment rather than replaced.
   * @param children - the fence contents, i.e. the `<code>` element whose
   *   `language-*` class names the badge.
   * @param props - the remaining native `<pre>` props, spread onto the `<pre>`.
   * @returns the wrapper `div` holding the optional language badge and the
   *   `<pre>` itself.
   */
  pre: ({ className, children, ...props }: ComponentPropsWithoutRef<'pre'>) => {
    const language = fenceLanguage(children);

    return (
      <div className="mb-(--space-6) flex w-full max-w-(--measure-article) flex-col overflow-hidden rounded-xl bg-surface-active shadow-[var(--hairline-soft),inset_3px_0_0_0_var(--color-accent-deep)]">
        {language === null ? null : (
          <Badge className="mt-(--space-3) mr-(--space-3) self-end font-mono text-text-tertiary">
            {language}
          </Badge>
        )}
        <pre
          className={cn(
            'min-h-[calc(var(--space-4)*2+22px)] overflow-x-auto pr-(--space-4) pl-(--space-5) font-mono text-sm leading-loose text-code-fg',
            language === null
              ? 'py-(--space-4)'
              : 'pt-(--space-2) pb-(--space-4)',
            className,
          )}
          {...props}
        >
          {children}
        </pre>
      </div>
    );
  },
  code: ({ className, ...props }: ComponentPropsWithoutRef<'code'>) => (
    <code
      className={cn(
        'rounded-sm bg-accent-tint px-1.5 py-0.5 font-mono text-sm text-accent-text [pre>&]:bg-transparent [pre>&]:p-0',
        className,
      )}
      {...props}
    />
  ),
  hr: (props: ComponentPropsWithoutRef<'hr'>) => (
    <hr className="my-12 h-px border-0 bg-(image:--gradient-rule)" {...props} />
  ),
};

/** Props accepted by {@link ArticleContent}. */
export interface ArticleContentProps {
  /**
   * The raw markdown body of the article, as read from the content endpoint by
   * the caller. The component never fetches; it renders what it is handed.
   */
  markdown: string;
}

/**
 * ArticleContent renders an article body from untrusted markdown.
 *
 * Article bodies are authored content served verbatim by the API, so the
 * rendered output is a stored-XSS surface (RISK-003). Two barriers sit in the
 * render path, and neither is a string pre-processing pass:
 *
 * 1. `rehype-raw` is not installed, so embedded raw HTML (`<script>`,
 *    `<img onerror>`, `<iframe>`) never becomes part of the element tree.
 * 2. `rehype-sanitize` runs over the tree with {@link ARTICLE_SANITIZE_SCHEMA},
 *    dropping any element, attribute or URL protocol outside the allow-list.
 *
 * `dangerouslySetInnerHTML` is never used.
 *
 * `rehype-highlight` runs *after* the sanitiser, never before: the barrier
 * therefore sees the authored tree rather than the highlighter's output, and
 * the `hljs-*` spans it adds downstream need no widening of the schema. The
 * highlighter runs here on the server, so no highlighting code and no language
 * grammar reaches the client bundle.
 *
 * This is a Server Component: the body is part of the server payload so the
 * article is crawlable and readable with JavaScript disabled (REQ-1.1, REQ-1.5).
 *
 * @param props.markdown - the raw markdown body of the article.
 * @returns the rendered prose, or `null` when the article has no content.
 */
export function ArticleContent({ markdown }: ArticleContentProps) {
  if (markdown.trim().length === 0) {
    return null;
  }

  return (
    <div className="max-w-(--measure-article) text-lg leading-prose text-text-secondary">
      <Markdown
        rehypePlugins={[
          [rehypeSanitize, ARTICLE_SANITIZE_SCHEMA],
          rehypeHighlight,
        ]}
        components={PROSE_COMPONENTS}
      >
        {markdown}
      </Markdown>
    </div>
  );
}
