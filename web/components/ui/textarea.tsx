import type { ComponentProps } from 'react';

import { fieldClassName } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * Textarea renders a multi-line text control.
 *
 * It shares the inset field treatment with `Input` and adds the multi-line
 * geometry DES-001 specifies: a 96px floor, block padding, body line-height and
 * vertical-only resizing so a growing message cannot break the 520px form
 * column.
 *
 * @param className - additional classes merged after the field classes.
 * @returns the styled textarea element.
 */
export function Textarea({ className, ...props }: ComponentProps<'textarea'>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        fieldClassName,
        'min-h-24 resize-y py-3 leading-normal',
        className,
      )}
      {...props}
    />
  );
}
