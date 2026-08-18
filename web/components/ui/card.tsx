import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Card renders the one panel surface the design allows.
 *
 * DES-001 is a document, not a dashboard: content is separated by hairline
 * rules, and a card is reserved for the rare block that has to be lifted off
 * the page (a callout, a disclosed spec). It is therefore a slightly lighter
 * surface with a soft hairline ring rather than a bordered, shadowed box.
 *
 * @param className - additional classes merged after the card classes.
 * @returns the card container element.
 */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card"
      className={cn(
        'flex flex-col gap-4 rounded-xl bg-surface p-5 shadow-(--hairline-soft)',
        className,
      )}
      {...props}
    />
  );
}

/**
 * CardHeader renders the title block of a card.
 *
 * @param className - additional classes merged after the header classes.
 * @returns the card header element.
 */
export function CardHeader({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        'flex flex-col gap-1 text-base font-medium text-text-primary',
        className,
      )}
      {...props}
    />
  );
}

/**
 * CardBody renders the content of a card.
 *
 * @param className - additional classes merged after the body classes.
 * @returns the card body element.
 */
export function CardBody({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      data-slot="card-body"
      className={cn('text-sm text-text-secondary', className)}
      {...props}
    />
  );
}
