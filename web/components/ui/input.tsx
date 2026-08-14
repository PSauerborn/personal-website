import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * The shared field treatment for every text control.
 *
 * DES-001 gives form controls no border at all: the field is a darker surface
 * pressed into the page with an inset shadow and a hairline ring, which is the
 * inverse of the raised button beside it. An invalid field swaps the hairline
 * for the danger ring — never colour alone, so the consuming form also renders
 * a sentence saying what to correct.
 */
export const fieldClassName = cn(
  'w-full rounded-md border-0 bg-surface px-3 text-sm text-text-primary',
  'shadow-[var(--shadow-inset),var(--hairline)]',
  'transition-shadow duration-(--duration-fast) ease-(--ease-out-quint)',
  'placeholder:text-text-tertiary',
  'hover:shadow-[var(--shadow-inset),var(--hairline-strong)]',
  'aria-invalid:shadow-[var(--shadow-inset),inset_0_0_0_1px_var(--color-danger-ring)]',
  'disabled:text-text-disabled disabled:placeholder:text-text-disabled',
);

/**
 * Input renders a single-line text control in the DES-001 inset treatment.
 *
 * @param className - additional classes merged after the field classes.
 * @param type - the input type; defaults to `text`.
 * @returns the styled input element.
 */
export function Input({
  className,
  type = 'text',
  ...props
}: ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(fieldClassName, 'h-10', className)}
      {...props}
    />
  );
}
