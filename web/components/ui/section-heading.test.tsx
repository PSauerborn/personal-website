import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { SectionHeading } from '@/components/ui/section-heading';

/**
 * Coverage for the shared section heading primitive.
 *
 * Eight sections across seven files rendered this eyebrow/heading/lede triple
 * verbatim before it was extracted, so the tests pin the parts the call sites
 * depend on: the caps eyebrow, the heading with the `id` their `aria-labelledby`
 * points at, the heading level (two routes open with an `h1`, the composed
 * sections use an `h2`), and the lede being genuinely optional rather than
 * rendered empty.
 */
describe('SectionHeading', () => {
  it('renders the eyebrow, the heading and the lede', () => {
    render(
      <SectionHeading
        id="catalogue-heading"
        eyebrow="Catalogue"
        heading="Every subagent, and what it is trusted with"
        lede="Each agent is a narrow specialist."
      />,
    );

    expect(screen.getByText('Catalogue')).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Every subagent, and what it is trusted with',
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Each agent is a narrow specialist.'),
    ).toBeInTheDocument();
  });

  it('puts the given id on the heading so aria-labelledby resolves', () => {
    render(
      <section aria-labelledby="catalogue-heading">
        <SectionHeading
          id="catalogue-heading"
          eyebrow="Catalogue"
          heading="Every subagent"
        />
      </section>,
    );

    expect(
      screen.getByRole('heading', { name: 'Every subagent' }),
    ).toHaveAttribute('id', 'catalogue-heading');
    expect(screen.getByRole('region')).toHaveAccessibleName('Every subagent');
  });

  it('renders an h2 by default and an h1 when asked for one', () => {
    const { rerender } = render(
      <SectionHeading id="a" eyebrow="Writing" heading="Notes" />,
    );
    expect(screen.getByRole('heading', { level: 2 })).toBeInTheDocument();

    rerender(
      <SectionHeading id="a" eyebrow="Writing" heading="Notes" level={1} />,
    );
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });

  it('omits the lede paragraph entirely when no lede is given', () => {
    const { container } = render(
      <SectionHeading id="a" eyebrow="Curriculum vitae" heading="Where" />,
    );

    expect(container.querySelectorAll('p')).toHaveLength(1);
  });

  it('emits the DES-001 eyebrow, heading and lede classes', () => {
    const { container } = render(
      <SectionHeading
        id="a"
        eyebrow="Projects"
        heading="Built"
        lede="A ledger."
      />,
    );

    const [eyebrow, lede] = Array.from(container.querySelectorAll('p'));

    expect(eyebrow.className).toBe(
      'text-xs font-semibold tracking-wide text-accent-text uppercase',
    );
    expect(screen.getByRole('heading').className).toBe(
      'mt-4 text-3xl font-medium tracking-tight text-text-primary',
    );
    expect(lede.className).toBe(
      'mt-4 max-w-(--measure-lede) text-base text-text-secondary',
    );
  });
});
