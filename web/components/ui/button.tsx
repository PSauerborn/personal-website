import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * buttonVariants is the class map behind `Button`, exported so a non-button
 * element (a link styled as an action) can carry the same treatment.
 *
 * The treatments come straight from DES-001: `primary` is the solid accent
 * action — one per view — `secondary` is the raised grey surface with a
 * hairline, and `ghost` is text that only gains a surface on hover. Sizes are
 * the two the design uses: the 40px control that matches the input height and
 * the 48px call to action, whose radius steps up rather than scaling with it.
 */
export const buttonVariants = cva(
  cn(
    'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap',
    'font-medium transition-colors duration-(--duration-fast) ease-(--ease-out-quint)',
    'disabled:pointer-events-none disabled:text-text-disabled',
    '[&_svg]:pointer-events-none [&_svg]:shrink-0',
  ),
  {
    variants: {
      variant: {
        primary:
          'bg-accent text-text-primary shadow-raised hover:bg-accent-hover active:bg-accent-active',
        secondary: cn(
          'bg-surface-active text-text-primary hover:bg-surface-hover',
          'shadow-[var(--shadow-raised),var(--hairline)]',
        ),
        ghost: 'text-text-secondary hover:bg-surface hover:text-text-primary',
      },
      size: {
        default: 'h-10 rounded-md px-4 text-sm',
        lg: 'h-12 rounded-lg px-6 text-base',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'default',
    },
  },
);

/** Props accepted by `Button`, plus the variant and size selectors. */
export type ButtonProps = ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    /** Render the child element instead of a `<button>`, keeping the styling. */
    asChild?: boolean;
  };

/**
 * Button renders the application's action control.
 *
 * @param variant - visual weight of the action; defaults to `primary`.
 * @param size - control height; `lg` is the 48px call to action.
 * @param asChild - when true the single child element is rendered in place of
 *   the `<button>`, which is how a link is given a button's appearance without
 *   nesting interactive elements.
 * @param className - additional classes merged after the variant classes.
 * @returns the styled button element.
 */
export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Component = asChild ? Slot : 'button';

  return (
    <Component
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
