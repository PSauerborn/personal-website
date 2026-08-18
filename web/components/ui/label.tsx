import * as LabelPrimitive from '@radix-ui/react-label';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Label renders the caption of a form control.
 *
 * DES-001 sets field labels at 14px medium in the primary text colour — they
 * are content, not signposts, so they do not use the 12px caps treatment. The
 * label dims with its control when the control is disabled.
 *
 * @param className - additional classes merged after the label classes.
 * @returns the styled label element.
 */
export function Label({
  className,
  ...props
}: ComponentProps<typeof LabelPrimitive.Root>) {
  return (
    <LabelPrimitive.Root
      data-slot="label"
      className={cn(
        'inline-flex items-center gap-2 text-sm font-medium text-text-primary',
        'peer-disabled:pointer-events-none peer-disabled:text-text-disabled',
        className,
      )}
      {...props}
    />
  );
}
