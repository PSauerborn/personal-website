import * as TabsPrimitive from '@radix-ui/react-tabs';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/utils';

/**
 * Tabs is the root of a tabbed section (the CV explorer's Experience/Education
 * switch).
 *
 * @param className - additional classes merged after the root classes.
 * @returns the tabs root element.
 */
export function Tabs({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Root>) {
  return (
    <TabsPrimitive.Root
      data-slot="tabs"
      className={cn('flex flex-col', className)}
      {...props}
    />
  );
}

/**
 * TabsList renders the tab strip.
 *
 * DES-001 replaces the shadcn pill strip with an underline strip: the list is a
 * hairline rule and the active trigger sits on top of it with an accent
 * underline, so the tabs read as part of the document rather than as a control.
 *
 * @param className - additional classes merged after the strip classes.
 * @returns the tab list element.
 */
export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'flex items-center gap-1 border-b border-border-subtle',
        className,
      )}
      {...props}
    />
  );
}

/**
 * TabsTrigger renders one tab in the strip.
 *
 * @param className - additional classes merged after the trigger classes.
 * @returns the tab trigger element.
 */
export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        '-mb-px border-b-2 border-transparent px-3 py-3 text-sm font-medium',
        'text-text-tertiary transition-colors duration-(--duration-fast)',
        'hover:text-text-secondary',
        'data-[state=active]:border-accent-text data-[state=active]:text-text-primary',
        'disabled:pointer-events-none disabled:text-text-disabled',
        className,
      )}
      {...props}
    />
  );
}

/**
 * TabsContent renders the panel belonging to one tab.
 *
 * `data-[state=inactive]:hidden` is what actually hides the inactive panel when
 * the caller passes `forceMount`. Radix computes the panel's `hidden` attribute
 * as `!present`, and `present` is `forceMount || isSelected` — so a force-mounted
 * panel is *never* given the attribute and every panel renders at once, which is
 * how the CV explorer came to list education below experience with the tab strip
 * doing nothing. The `data-state` attribute still tracks the real selection, so
 * hiding on it restores the switch while leaving the markup of both panels in
 * the server response, which is why `forceMount` is there (REQ-1.5: the whole CV
 * must be crawlable from the first response).
 *
 * @param className - additional classes merged after the panel classes.
 * @returns the tab panel element.
 */
export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn('outline-none data-[state=inactive]:hidden', className)}
      {...props}
    />
  );
}
