import type { ComponentProps } from 'react';

import { fieldClassName } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/** One entry in a {@link Select}'s flat option list. */
export interface SelectOption {
  /** The value submitted and reported by the control. */
  value: string;
  /** The human-readable text shown in the list. */
  label: string;
}

/** Props accepted by {@link Select}. */
export interface SelectProps extends Omit<
  ComponentProps<'select'>,
  'children'
> {
  /** The options to render, in the order they should appear. */
  options: SelectOption[];
}

/**
 * Select renders a native `<select>` in the DES-001 inset field treatment.
 *
 * D5 keeps this a native control rather than a scripted listbox: the browser
 * supplies the popup, the keyboard model and the mobile picker for free, so the
 * component is presentational and server-safe — no `'use client'`, no state, no
 * effects. `appearance-none` drops the platform arrow so the field matches the
 * `Input` beside it, and the chevron drawn here replaces it as a purely
 * decorative (`aria-hidden`) affordance. The option list is deliberately flat:
 * no `<optgroup>`. Focus is left to the site-wide `:focus-visible` ring in
 * `styles/app.css`, which already meets contrast on the header strip.
 *
 * @param className - additional classes merged onto the wrapper, which is where
 *   layout constraints such as a max width belong (the `<select>` itself fills
 *   the wrapper).
 * @param options - the flat option list to render.
 * @returns the wrapper holding the select and its chevron.
 */
export function Select({ className, options, ...props }: SelectProps) {
  return (
    <div
      data-slot="select"
      className={cn('relative inline-flex w-full items-center', className)}
    >
      <select
        data-slot="select-control"
        className={cn(fieldClassName, 'h-10 appearance-none pr-9')}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      <svg
        aria-hidden="true"
        focusable="false"
        viewBox="0 0 16 16"
        className="pointer-events-none absolute right-3 size-4 text-text-tertiary"
      >
        <path
          d="M4 6.5 8 10.5 12 6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
