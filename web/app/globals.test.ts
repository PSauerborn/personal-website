import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { SWITCHER_BODY_ATTRIBUTE } from '@/components/ui/select-switcher';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * readStylesheet returns the text of a stylesheet in the token source set.
 *
 * @param relativePath - path to the stylesheet, relative to `web/`.
 * @returns the stylesheet's contents as UTF-8 text.
 */
function readStylesheet(relativePath: string): string {
  return readFileSync(resolve(here, '..', relativePath), 'utf8');
}

/**
 * readStylesheetSet returns the concatenated text of `globals.css` and every
 * stylesheet it imports from the application, so assertions can be made about
 * the rules the application actually loads rather than one file in isolation.
 *
 * @returns the concatenated contents of the imported stylesheet set.
 */
function readStylesheetSet(): string {
  const globals = readStylesheet('app/globals.css');
  const imported = [...globals.matchAll(/@import\s+['"](\.[^'"]+)['"]/g)].map(
    (match) => readFileSync(resolve(here, match[1]), 'utf8'),
  );

  return [globals, ...imported].join('\n');
}

/**
 * readCodeThemeRules returns the part of `globals.css` that follows the
 * `@theme static` block, i.e. the hand-authored rules rather than the token
 * declarations, so a test can assert that no literal colour escapes the token
 * block.
 *
 * @returns the text of `globals.css` after the `@theme static` block closes.
 */
function readCodeThemeRules(): string {
  const globals = readStylesheet('app/globals.css');
  const themeStart = globals.indexOf('@theme static');
  const themeEnd = globals.indexOf('\n}\n', themeStart);

  return themeEnd === -1 ? '' : globals.slice(themeEnd + 3);
}

/**
 * findRuleFor returns the declaration body of the rule whose selector list
 * contains the given selector exactly.
 *
 * @param selector - the full selector to look for, such as `.hljs-title.class_`.
 * @returns the declarations inside that rule, or `undefined` when no rule
 *   declares the selector.
 */
function findRuleFor(selector: string): string | undefined {
  const rules = [
    ...readCodeThemeRules()
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .matchAll(/([^{}]+)\{([^{}]*)\}/g),
  ];
  const match = rules.find((rule) =>
    rule[1]
      .split(',')
      .map((candidate) => candidate.trim())
      .includes(selector),
  );

  return match?.[2];
}

/** The `--color-code-*` family, as declared by DES-002 option 4. */
const CODE_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ['--color-code-fg', 'hsl(210 17% 82%)'],
  ['--color-code-muted', 'hsl(212 9% 58%)'],
  ['--color-code-keyword', 'hsl(4 100% 72%)'],
  ['--color-code-title', 'hsl(269 100% 83%)'],
  ['--color-code-literal', 'hsl(208 100% 74%)'],
  ['--color-code-string', 'hsl(207 100% 82%)'],
  ['--color-code-builtin', 'hsl(28 100% 67%)'],
  ['--color-code-name', 'hsl(125 69% 70%)'],
  ['--color-code-bullet', 'hsl(44 85% 66%)'],
  ['--color-code-section', 'hsl(212 100% 67%)'],
  ['--color-code-addition', 'hsl(124 78% 82%)'],
  ['--color-code-addition-bg', 'hsl(141 90% 12%)'],
  ['--color-code-deletion', 'hsl(8 100% 92%)'],
  ['--color-code-deletion-bg', 'hsl(356 100% 21%)'],
];

/** Every highlight.js selector the theme styles, and the token it must read. */
const CODE_CLASS_MAP: ReadonlyArray<readonly [string, string]> = [
  ['.hljs-subst', '--color-code-fg'],
  ['.hljs-params', '--color-code-fg'],
  ['.hljs-property', '--color-code-fg'],
  ['.hljs-punctuation', '--color-code-fg'],
  ['.hljs-tag', '--color-code-fg'],
  ['.hljs-emphasis', '--color-code-fg'],
  ['.hljs-strong', '--color-code-fg'],
  ['.hljs-link', '--color-code-fg'],
  ['.hljs-char.escape_', '--color-code-fg'],
  ['.hljs-comment', '--color-code-muted'],
  ['.hljs-code', '--color-code-muted'],
  ['.hljs-formula', '--color-code-muted'],
  ['.hljs-keyword', '--color-code-keyword'],
  ['.hljs-doctag', '--color-code-keyword'],
  ['.hljs-template-tag', '--color-code-keyword'],
  ['.hljs-template-variable', '--color-code-keyword'],
  ['.hljs-type', '--color-code-keyword'],
  ['.hljs-variable.language_', '--color-code-keyword'],
  ['.hljs-title', '--color-code-title'],
  ['.hljs-title.class_', '--color-code-title'],
  ['.hljs-title.class_.inherited__', '--color-code-title'],
  ['.hljs-title.function_', '--color-code-title'],
  ['.hljs-attr', '--color-code-literal'],
  ['.hljs-attribute', '--color-code-literal'],
  ['.hljs-literal', '--color-code-literal'],
  ['.hljs-meta', '--color-code-literal'],
  ['.hljs-number', '--color-code-literal'],
  ['.hljs-operator', '--color-code-literal'],
  ['.hljs-variable', '--color-code-literal'],
  ['.hljs-selector-attr', '--color-code-literal'],
  ['.hljs-selector-class', '--color-code-literal'],
  ['.hljs-selector-id', '--color-code-literal'],
  ['.hljs-string', '--color-code-string'],
  ['.hljs-regexp', '--color-code-string'],
  ['.hljs-meta .hljs-string', '--color-code-string'],
  ['.hljs-built_in', '--color-code-builtin'],
  ['.hljs-symbol', '--color-code-builtin'],
  ['.hljs-name', '--color-code-name'],
  ['.hljs-quote', '--color-code-name'],
  ['.hljs-selector-tag', '--color-code-name'],
  ['.hljs-selector-pseudo', '--color-code-name'],
  ['.hljs-bullet', '--color-code-bullet'],
  ['.hljs-section', '--color-code-section'],
  ['.hljs-addition', '--color-code-addition'],
  ['.hljs-deletion', '--color-code-deletion'],
];

describe('design tokens', () => {
  it('resolves the tertiary text token to the WCAG AA corrected value', () => {
    expect(readStylesheet('app/globals.css')).toContain(
      '--color-text-tertiary: hsl(220 5% 50%)',
    );
  });

  it('declares no token at the failing tertiary lightness', () => {
    expect(readStylesheet('app/globals.css')).not.toContain('hsl(220 5% 42%)');
  });

  it('forces the hidden attribute to win over the utility layer', () => {
    expect(readStylesheetSet()).toMatch(
      /\[hidden\]\s*\{\s*display:\s*none\s*!important;\s*\}/,
    );
  });

  it('clears the sticky header when an in-page anchor is followed', () => {
    // Read as tokens rather than as pixels: the offset is the header's own
    // height plus one step of the spacing scale, so a taller header moves
    // every anchor on the site with it.
    expect(readStylesheetSet()).toMatch(
      /scroll-padding-top:\s*calc\(var\(--header-height\)\s*\+\s*var\(--space-5\)\);/,
    );
  });

  it('hides every unselected switcher body once the switcher is ready', () => {
    expect(readStylesheetSet()).toMatch(
      new RegExp(
        `\\[data-switcher='ready'\\]\\s+\\[${SWITCHER_BODY_ATTRIBUTE}\\]` +
          `:not\\(\\[data-selected\\]\\)\\s*\\{\\s*display:\\s*none;\\s*\\}`,
      ),
    );
  });

  it.each(CODE_TOKENS)('declares %s exactly once as %s', (token, value) => {
    const declarations = readStylesheet('app/globals.css').split(
      `${token}: ${value};`,
    );

    expect(declarations).toHaveLength(2);
  });

  it('declares the shared article measure as the content column', () => {
    expect(readStylesheet('app/globals.css')).toContain(
      '--measure-article: var(--container-column);',
    );
  });

  it('keeps the prose measure, still used outside the article route', () => {
    expect(readStylesheet('app/globals.css')).toContain(
      '--measure-prose: 65ch',
    );
  });
});

describe('code theme', () => {
  it('wells the code block on the active surface in the base foreground', () => {
    const base = findRuleFor('.hljs');

    expect(base).toContain('background: var(--color-surface-active);');
    expect(base).toContain('color: var(--color-code-fg);');
  });

  it.each(CODE_CLASS_MAP)('paints %s with var(%s)', (selector, token) => {
    expect(findRuleFor(selector)).toContain(`color: var(${token});`);
  });

  it('pairs the diff rules with their own backgrounds', () => {
    expect(findRuleFor('.hljs-addition')).toContain(
      'background: var(--color-code-addition-bg);',
    );
    expect(findRuleFor('.hljs-deletion')).toContain(
      'background: var(--color-code-deletion-bg);',
    );
  });

  it('keeps the section weight so colour is not its only carrier', () => {
    expect(findRuleFor('.hljs-section')).toContain(
      'font-weight: var(--font-weight-semibold);',
    );
  });

  it('documents the section lift away from literal github-dark', () => {
    const globals = readStylesheet('app/globals.css');

    expect(globals).toContain('#1f6feb');
    expect(globals).toContain('3.50:1');
  });

  it('declares no literal colour outside the token block', () => {
    const rules = readCodeThemeRules().replace(/\/\*[\s\S]*?\*\//g, '');

    expect(rules).not.toMatch(/hsl\(|rgb\(|#[0-9a-fA-F]{3}/);
  });

  it('imports no vendor stylesheet for the highlighting theme', () => {
    const imports = [
      ...readStylesheet('app/globals.css').matchAll(
        /@import\s+['"]([^'"]+)['"]/g,
      ),
    ].map((match) => match[1]);

    expect(imports).toEqual(['tailwindcss', '../styles/app.css']);
  });

  it('introduces no media query literal', () => {
    expect(readCodeThemeRules()).not.toContain('@media');
  });
});
