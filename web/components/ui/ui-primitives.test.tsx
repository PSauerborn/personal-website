import { fireEvent, render, screen } from '@testing-library/react';
import Link from 'next/link';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select } from '@/components/ui/select';
import {
  SelectSwitcher,
  SWITCHER_BODY_ATTRIBUTE,
} from '@/components/ui/select-switcher';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Toggle } from '@/components/ui/toggle';

/**
 * Behavioural coverage for the shadcn/ui primitive layer.
 *
 * These tests assert the affordances DES-001 depends on — the association
 * between a label and its control, the underline tab strip actually switching
 * panels, the chip toggle exposing a pressed state, and the empty state
 * rendering its caps label and statement. Visual treatment is asserted only
 * where it is semantic (variant/size selection changes the emitted classes),
 * because the token values themselves are covered by the globals.css tests.
 */
describe('ui primitives', () => {
  describe('Button', () => {
    it('renders its children and forwards the click handler', () => {
      let clicks = 0;

      render(<Button onClick={() => (clicks += 1)}>Send message</Button>);
      fireEvent.click(screen.getByRole('button', { name: 'Send message' }));

      expect(clicks).toBe(1);
    });

    it('renders as the child element when asChild is set', () => {
      render(
        <Button asChild>
          <Link href="/blog">Read the writing</Link>
        </Button>,
      );

      const link = screen.getByRole('link', { name: 'Read the writing' });
      expect(link).toHaveAttribute('href', '/blog');
      expect(link.className).toContain('bg-accent');
    });

    it('applies the requested variant and size', () => {
      render(
        <Button variant="secondary" size="lg">
          Try again
        </Button>,
      );

      const button = screen.getByRole('button', { name: 'Try again' });
      expect(button.className).toContain('bg-surface-active');
      expect(button.className).toContain('h-12');
    });

    it('disables the underlying control when disabled', () => {
      render(<Button disabled>Send message</Button>);

      expect(
        screen.getByRole('button', { name: 'Send message' }),
      ).toBeDisabled();
    });
  });

  describe('Label, Input and Textarea', () => {
    it('associates a label with its input', () => {
      render(
        <div>
          <Label htmlFor="contact-name">Name</Label>
          <Input id="contact-name" placeholder="Dana Whitfield" />
        </div>,
      );

      const input = screen.getByLabelText('Name');
      fireEvent.change(input, { target: { value: 'Dana' } });

      expect(input).toHaveValue('Dana');
      expect(input).toHaveAttribute('placeholder', 'Dana Whitfield');
    });

    it('associates a label with its textarea', () => {
      render(
        <div>
          <Label htmlFor="contact-message">Message</Label>
          <Textarea id="contact-message" />
        </div>,
      );

      const textarea = screen.getByLabelText('Message');
      fireEvent.change(textarea, {
        target: { value: 'A sentence on the problem.' },
      });

      expect(textarea.tagName).toBe('TEXTAREA');
      expect(textarea).toHaveValue('A sentence on the problem.');
    });

    it('marks an invalid input for assistive technology', () => {
      render(<Input aria-label="Email" aria-invalid />);

      expect(screen.getByLabelText('Email')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });

    it('marks an invalid textarea for assistive technology', () => {
      render(<Textarea aria-label="Comment" aria-invalid />);

      expect(screen.getByLabelText('Comment')).toHaveAttribute(
        'aria-invalid',
        'true',
      );
    });
  });

  describe('Badge', () => {
    it('renders its content', () => {
      render(<Badge>Current</Badge>);

      expect(screen.getByText('Current')).toBeInTheDocument();
    });

    it('applies the requested variant', () => {
      render(<Badge variant="accent">Kafka</Badge>);

      expect(screen.getByText('Kafka').className).toContain('bg-accent-tint');
    });
  });

  describe('Card', () => {
    it('renders its header and body', () => {
      render(
        <Card>
          <CardHeader>Curriculum vitae</CardHeader>
          <CardBody>Eleven years of backend platforms</CardBody>
        </Card>,
      );

      expect(screen.getByText('Curriculum vitae')).toBeInTheDocument();
      expect(
        screen.getByText('Eleven years of backend platforms'),
      ).toBeInTheDocument();
    });
  });

  describe('Select', () => {
    const languages = [
      { value: 'go', label: 'Go' },
      { value: 'python', label: 'Python' },
      { value: 'typescript', label: 'TypeScript' },
    ];

    it('associates a native select with its label and takes focus', () => {
      render(
        <div>
          <Label htmlFor="language">Language</Label>
          <Select id="language" options={languages} defaultValue="python" />
        </div>,
      );

      const select = screen.getByLabelText('Language');
      expect(select.tagName).toBe('SELECT');
      expect(select).toHaveValue('python');
      expect(select).not.toBeDisabled();

      // Keyboard operability: the control is in the tab order and, once
      // focused, the site-wide `:focus-visible` ring in app.css applies.
      select.focus();
      expect(select).toHaveFocus();
      expect(select).not.toHaveAttribute('tabindex', '-1');

      fireEvent.change(select, { target: { value: 'go' } });
      expect(select).toHaveValue('go');
    });

    it('renders a flat option list with no optgroup', () => {
      const { container } = render(
        <Select aria-label="Language" options={languages} />,
      );

      expect(container.querySelector('optgroup')).toBeNull();
      expect(
        [...container.querySelectorAll('option')].map(
          (option) => option.textContent,
        ),
      ).toEqual(['Go', 'Python', 'TypeScript']);
      expect(
        [...container.querySelectorAll('option')].every(
          (option) => option.parentElement?.tagName === 'SELECT',
        ),
      ).toBe(true);
    });

    it('wears the canonical field treatment and hides its chevron', () => {
      const { container } = render(
        <Select aria-label="Language" options={languages} />,
      );

      const select = screen.getByLabelText('Language');
      expect(select.className).toContain('appearance-none');
      expect(select.className).toContain('bg-surface');
      expect(select.className).toContain('shadow-[var(--shadow-inset)');

      const chevron = container.querySelector('svg');
      expect(chevron).not.toBeNull();
      expect(chevron).toHaveAttribute('aria-hidden', 'true');
    });

    it('merges additional classes onto its wrapper', () => {
      render(
        <Select
          aria-label="Language"
          options={languages}
          className="max-w-[360px]"
        />,
      );

      expect(
        screen.getByLabelText('Language').parentElement?.className,
      ).toContain('max-w-[360px]');
    });
  });

  describe('SelectSwitcher', () => {
    const agents = [
      { value: 'planner', label: 'Work planner' },
      { value: 'executor', label: 'Task executor' },
      { value: 'reviewer', label: 'Code reviewer' },
    ];

    /**
     * panelTree builds a panel of server-shaped bodies alongside the switcher,
     * mirroring how TASK-007 composes them.
     *
     * @param options - the options the switcher drives.
     * @returns the panel element tree.
     */
    function panelTree(options: { value: string; label: string }[]) {
      return (
        <div id="agent-panel">
          <SelectSwitcher
            panelId="agent-panel"
            selectId="agent-select"
            label="Subagent"
            itemNoun="agents"
            options={options}
          />
          {options.map((option) => (
            <div
              key={option.value}
              {...{ [SWITCHER_BODY_ATTRIBUTE]: option.value }}
            >
              {option.label} body
            </div>
          ))}
        </div>
      );
    }

    /**
     * renderPanel renders the panel built by {@link panelTree}.
     *
     * @param options - the options the switcher drives.
     * @returns the testing-library render result.
     */
    function renderPanel(options: { value: string; label: string }[]) {
      return render(panelTree(options));
    }

    it('seeds its state with the first option and marks the panel ready', () => {
      renderPanel(agents);

      expect(screen.getByLabelText('Subagent')).toHaveValue('planner');
      expect(document.getElementById('agent-panel')).toHaveAttribute(
        'data-switcher',
        'ready',
      );

      const selected = document.querySelectorAll('[data-selected]');
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveAttribute(SWITCHER_BODY_ATTRIBUTE, 'planner');
    });

    it('moves the selected marker to the newly chosen body', () => {
      renderPanel(agents);

      fireEvent.change(screen.getByLabelText('Subagent'), {
        target: { value: 'reviewer' },
      });

      const selected = document.querySelectorAll('[data-selected]');
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveAttribute(SWITCHER_BODY_ATTRIBUTE, 'reviewer');
    });

    it('reports the selected position out of the total once hydrated', () => {
      renderPanel(agents);

      expect(screen.getByRole('status')).toHaveTextContent('1 of 3');

      fireEvent.change(screen.getByLabelText('Subagent'), {
        target: { value: 'executor' },
      });

      expect(screen.getByRole('status')).toHaveTextContent('2 of 3');
    });

    it('reselects the first body when its options no longer carry the selection', () => {
      // An RSC re-render can hand the mounted switcher a different option list.
      // The selection is derived rather than trusted, so the dropped value can
      // never leave the panel with every body unmarked — which the CSS rule
      // would render as an empty panel.
      const { rerender } = renderPanel(agents);
      rerender(panelTree([agents[1], agents[2]]));

      const selected = document.querySelectorAll('[data-selected]');
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveAttribute(SWITCHER_BODY_ATTRIBUTE, 'executor');
      expect(screen.getByLabelText('Subagent')).toHaveValue('executor');
      expect(screen.getByRole('status')).toHaveTextContent('1 of 2');
    });

    it('keeps a selection its new options still carry', () => {
      const { rerender } = renderPanel(agents);

      fireEvent.change(screen.getByLabelText('Subagent'), {
        target: { value: 'reviewer' },
      });
      rerender(panelTree([agents[1], agents[2]]));

      const selected = document.querySelectorAll('[data-selected]');
      expect(selected).toHaveLength(1);
      expect(selected[0]).toHaveAttribute(SWITCHER_BODY_ATTRIBUTE, 'reviewer');
      expect(screen.getByRole('status')).toHaveTextContent('2 of 2');
    });

    it('reads 1 of 1 for a single-option list', () => {
      renderPanel([agents[0]]);

      expect(screen.getByRole('status')).toHaveTextContent('1 of 1');
    });

    it('renders labelled, counted markup before hydration', () => {
      const markup = renderToStaticMarkup(
        <SelectSwitcher
          panelId="agent-panel"
          selectId="agent-select"
          label="Subagent"
          itemNoun="agents"
          options={agents}
        />,
      );

      expect(markup).toContain('3 agents');
      expect(markup).toContain('for="agent-select"');
      expect(markup).toContain('id="agent-select"');
      expect(markup).toContain('Work planner');
    });
  });

  describe('Separator', () => {
    it('renders a decorative hairline by default', () => {
      const { container } = render(<Separator />);

      const separator = container.firstElementChild;
      expect(separator).not.toBeNull();
      expect(separator).toHaveAttribute('data-orientation', 'horizontal');
    });

    it('exposes a semantic separator role when it is not decorative', () => {
      render(<Separator decorative={false} />);

      expect(screen.getByRole('separator')).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('switches the visible panel when a trigger is selected', () => {
      render(
        <Tabs defaultValue="experience">
          <TabsList aria-label="Curriculum vitae sections">
            <TabsTrigger value="experience">Experience</TabsTrigger>
            <TabsTrigger value="education">Education</TabsTrigger>
          </TabsList>
          <TabsContent value="experience">
            Principal Backend Engineer
          </TabsContent>
          <TabsContent value="education">MSc Physics</TabsContent>
        </Tabs>,
      );

      expect(
        screen.getByText('Principal Backend Engineer'),
      ).toBeInTheDocument();
      expect(screen.queryByText('MSc Physics')).not.toBeInTheDocument();

      // Radix activates a tab on mousedown rather than on click.
      fireEvent.mouseDown(screen.getByRole('tab', { name: 'Education' }));

      expect(screen.getByText('MSc Physics')).toBeInTheDocument();
      expect(
        screen.queryByText('Principal Backend Engineer'),
      ).not.toBeInTheDocument();
      expect(screen.getByRole('tab', { name: 'Education' })).toHaveAttribute(
        'aria-selected',
        'true',
      );
    });
  });

  describe('Toggle', () => {
    it('exposes its pressed state and reports changes', () => {
      const pressed: boolean[] = [];

      render(
        <Toggle onPressedChange={(next) => pressed.push(next)}>Kafka</Toggle>,
      );

      const chip = screen.getByRole('button', { name: 'Kafka' });
      expect(chip).toHaveAttribute('aria-pressed', 'false');

      fireEvent.click(chip);

      expect(pressed).toEqual([true]);
      expect(chip).toHaveAttribute('aria-pressed', 'true');
      expect(chip).toHaveAttribute('data-state', 'on');
    });

    it('honours a controlled pressed value', () => {
      render(
        <Toggle pressed onPressedChange={() => {}}>
          PostgreSQL
        </Toggle>,
      );

      expect(
        screen.getByRole('button', { name: 'PostgreSQL' }),
      ).toHaveAttribute('aria-pressed', 'true');
    });
  });

  describe('EmptyState', () => {
    it('renders the caps label and the statement', () => {
      render(
        <EmptyState label="Projects" statement="No projects listed yet" />,
      );

      expect(screen.getByText('Projects')).toBeInTheDocument();
      expect(
        screen.getByRole('heading', { name: 'No projects listed yet' }),
      ).toBeInTheDocument();
    });

    it('renders the optional description and action', () => {
      render(
        <EmptyState
          label="Comments"
          statement="Be the first to respond"
          description="The thread is empty for now."
          action={<Button variant="secondary">Write a comment</Button>}
        />,
      );

      expect(
        screen.getByText('The thread is empty for now.'),
      ).toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Write a comment' }),
      ).toBeInTheDocument();
    });

    it('omits the description and action when they are not supplied', () => {
      render(<EmptyState label="Writing" statement="Nothing published yet" />);

      expect(screen.queryByRole('button')).not.toBeInTheDocument();
    });
  });
});
