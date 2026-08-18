import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * badgeVariants is the class map behind `Badge`.
 *
 * Badges are the smallest labelled surface in DES-001: stack tokens on a role,
 * article topics, and the `Current` marker. `neutral` is the default metadata
 * chip, `accent` marks a search or filter hit, and `success` is the live
 * "Current" marker — each is a tint plus text in the same hue, never a solid
 * fill with grey text on it.
 */
export const badgeVariants = cva(
  'inline-flex h-5 shrink-0 items-center gap-1 rounded-sm px-2 text-xs font-medium whitespace-nowrap',
  {
    variants: {
      variant: {
        neutral:
          'bg-surface-active text-text-secondary shadow-(--hairline-soft)',
        accent: cn(
          'bg-accent-tint text-accent-bright',
          'shadow-[inset_0_0_0_1px_var(--color-accent-glow)]',
        ),
        success: 'bg-success-tint text-success',
      },
    },
    defaultVariants: {
      variant: 'neutral',
    },
  },
);

/** Props accepted by `Badge`, plus the variant selector. */
export type BadgeProps = ComponentProps<'span'> &
  VariantProps<typeof badgeVariants> & {
    /** Render the child element instead of a `<span>`, keeping the styling. */
    asChild?: boolean;
  };

/**
 * Badge renders a small labelled marker such as a stack token or a topic.
 *
 * @param variant - tint to apply; defaults to `neutral`.
 * @param asChild - when true the single child element is rendered in place of
 *   the `<span>`, which is how a topic link carries the badge styling.
 * @param className - additional classes merged after the variant classes.
 * @returns the styled badge element.
 */
export function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: BadgeProps) {
  const Component = asChild ? Slot : 'span';

  return (
    <Component
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  );
}
