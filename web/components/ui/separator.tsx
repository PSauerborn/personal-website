import * as SeparatorPrimitive from '@radix-ui/react-separator';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Separator renders the hairline rule that divides ledger rows and list items.
 *
 * DES-001 separates content with a single-pixel alpha rule rather than a solid
 * border or a card edge, so the rule is drawn as a 1px block in the subtle
 * border colour. A separator is decorative by default; pass `decorative={false}`
 * when the division is meaningful enough to announce.
 *
 * @param className - additional classes merged after the separator classes.
 * @param orientation - `horizontal` (the default) or `vertical`.
 * @param decorative - when true (the default) the rule is hidden from the
 *   accessibility tree.
 * @returns the styled separator element.
 */
export function Separator({
  className,
  orientation = 'horizontal',
  decorative = true,
  ...props
}: ComponentProps<typeof SeparatorPrimitive.Root>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      orientation={orientation}
      decorative={decorative}
      className={cn(
        'shrink-0 bg-border-subtle',
        'data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full',
        'data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px',
        className,
      )}
      {...props}
    />
  );
}
