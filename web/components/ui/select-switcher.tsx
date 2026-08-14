'use client';

import {
  useEffect,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
} from 'react';

import { Label } from '@/components/ui/label';
import { Select, type SelectOption } from '@/components/ui/select';

/**
 * subscribeToNothing is the no-op subscription of the hydration store below:
 * the answer to "has this rendered on the client yet" never changes after the
 * first client render, so there is nothing to subscribe to.
 *
 * @returns an unsubscribe function that does nothing.
 */
function subscribeToNothing() {
  return () => {};
}

/**
 * getHydrated reports the client-side answer of the hydration store.
 *
 * @returns always `true` — it is only ever called in the browser.
 */
function getHydrated() {
  return true;
}

/**
 * getHydratedOnServer reports the server-side answer of the hydration store,
 * which is also the value React uses for the hydrating render.
 *
 * @returns always `false`.
 */
function getHydratedOnServer() {
  return false;
}

/**
 * The attribute each switchable body carries to declare which option it belongs
 * to. It is a literal rather than a prop: the matching hide rule lives in
 * `web/app/globals.css` (`[data-switcher='ready'] [data-agent]:not(
 * [data-selected])`) and names this attribute too, so a caller-supplied value
 * would produce a switcher that hides nothing. Exported so the stylesheet test
 * can assert the shipped rule names the attribute this component writes — the
 * type system cannot check a contract whose other half is CSS.
 */
export const SWITCHER_BODY_ATTRIBUTE = 'data-agent';

/** Props accepted by {@link SelectSwitcher}. */
export interface SelectSwitcherProps {
  /** The `id` of the panel element holding the bodies this switcher drives. */
  panelId: string;
  /** The `id` given to the `<select>`, paired to the label via `htmlFor`. */
  selectId: string;
  /** The visible caption of the control. */
  label: string;
  /** The plural noun used in the pre-hydration count, e.g. `agents`. */
  itemNoun: string;
  /**
   * The options to switch between. The first one is selected initially, and
   * again whenever a later `options` array no longer carries the selection.
   */
  options: SelectOption[];
}

/**
 * SelectSwitcher renders the panel header that flips which body is shown.
 *
 * D6 makes the hiding CSS-driven over server-rendered markup that already
 * contains every body: this component neither owns nor filters that content, it
 * only moves a `data-selected` marker between the bodies inside `panelId` and
 * stamps `data-switcher="ready"` on the panel once it has mounted. That
 * attribute is what lets the stylesheet start hiding bodies, so with JavaScript
 * disabled nothing is ever hidden — the dropdown is inert and all bodies stay
 * visible, which is the accepted degradation. The header still renders fully in
 * that state: a real label, a real select, and a count reading `{total} {noun}`
 * rather than the hydrated `{position} of {total}`.
 *
 * This is the single client boundary of its feature, and it lives under
 * `components/ui/**` on purpose — the agents route is asserted to contain no
 * client components.
 *
 * Selector contract, which no type can check because its other half is a
 * stylesheet: this component is the only writer of `data-switcher` on the panel
 * and of `data-selected` on the bodies, and it reads each body's option value
 * from {@link SWITCHER_BODY_ATTRIBUTE}. The rule that acts on those three
 * attributes lives in `web/app/globals.css`, under the "Switcher panels"
 * heading; change either side and the other must change with it.
 *
 * @param panelId - the id of the panel element containing the bodies.
 * @param selectId - the id given to the select control.
 * @param label - the visible caption of the control.
 * @param itemNoun - the plural noun used in the pre-hydration count.
 * @param options - the options to switch between.
 * @returns the panel header: label, select and live count.
 */
export function SelectSwitcher({
  panelId,
  selectId,
  label,
  itemNoun,
  options,
}: SelectSwitcherProps) {
  const [selected, setSelected] = useState(options[0]?.value ?? '');
  const hydrated = useSyncExternalStore(
    subscribeToNothing,
    getHydrated,
    getHydratedOnServer,
  );

  // The effective selection is derived rather than read straight out of state:
  // `options` can change under a mounted switcher (an RSC re-render of the
  // agents route, or a second consumer of this primitive), and a `selected`
  // value no option carries would leave every body unmarked — which the hide
  // rule in `globals.css` renders as an empty panel reading `0 of N`. Falling
  // back to the first option keeps exactly one body marked for any non-empty
  // list.
  const current = options.some((option) => option.value === selected)
    ? selected
    : (options[0]?.value ?? '');

  useEffect(() => {
    const panel = document.getElementById(panelId);
    if (!panel) {
      return;
    }

    panel.setAttribute('data-switcher', 'ready');
    for (const body of panel.querySelectorAll(`[${SWITCHER_BODY_ATTRIBUTE}]`)) {
      if (body.getAttribute(SWITCHER_BODY_ATTRIBUTE) === current) {
        body.setAttribute('data-selected', 'true');
      } else {
        body.removeAttribute('data-selected');
      }
    }
  }, [panelId, current]);

  const position = options.findIndex((option) => option.value === current) + 1;
  const count = hydrated
    ? `${position} of ${options.length}`
    : `${options.length} ${itemNoun}`;

  /**
   * handleChange records the newly chosen option so the effect can move the
   * `data-selected` marker onto its body.
   *
   * @param event - the change event from the native select.
   */
  function handleChange(event: ChangeEvent<HTMLSelectElement>) {
    setSelected(event.target.value);
  }

  return (
    <div
      data-slot="select-switcher"
      className="flex flex-wrap items-end justify-between gap-4"
    >
      <div className="flex w-full max-w-[360px] flex-col gap-2">
        <Label htmlFor={selectId}>{label}</Label>
        <Select
          id={selectId}
          options={options}
          value={current}
          onChange={handleChange}
        />
      </div>
      <p role="status" className="text-sm text-text-tertiary tabular-nums">
        {count}
      </p>
    </div>
  );
}
