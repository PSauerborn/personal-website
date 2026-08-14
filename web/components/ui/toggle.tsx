import * as TogglePrimitive from '@radix-ui/react-toggle';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Toggle renders a filter chip.
 *
 * DES-001 uses this for the CV skill filters and the blog topic filters, so the
 * control is a 28px pill rather than shadcn's square toggle. Radix drives
 * `data-[state=on]` and `aria-pressed` from the same value, and the pressed
 * chip changes both its background and its text colour so the state never rests
 * on colour alone.
 *
 * @param className - additional classes merged after the chip classes.
 * @returns the styled toggle element.
 */
export function Toggle({
  className,
  ...props
}: ComponentProps<typeof TogglePrimitive.Root>) {
  return (
    <TogglePrimitive.Root
      data-slot="toggle"
      className={cn(
        'inline-flex h-7 shrink-0 items-center gap-1 rounded-full px-3',
        'text-xs font-medium whitespace-nowrap',
        'bg-surface-active text-text-secondary shadow-(--hairline-soft)',
        'transition-colors duration-(--duration-fast) ease-(--ease-out-quint)',
        'hover:text-text-primary',
        'data-[state=on]:bg-accent data-[state=on]:text-text-primary data-[state=on]:shadow-raised',
        'disabled:pointer-events-none disabled:text-text-disabled',
        className,
      )}
      {...props}
    />
  );
}
