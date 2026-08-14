'use client';

import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SectionHeading } from '@/components/ui/section-heading';
import { Textarea } from '@/components/ui/textarea';
import { postMessage } from '@/lib/api/messages';
import type { CreateMessageRequest } from '@/lib/api/types';
import { cn } from '@/lib/utils';

/** The values the form holds, exactly as typed. */
export type ContactFormValues = {
  name: string;
  email: string;
  /** Optional: an empty value is omitted from the payload. */
  organization: string;
  message: string;
};

/** The fields that can carry a client-side validation message. */
export type ContactFormErrors = Partial<
  Record<'name' | 'email' | 'organization' | 'message', string>
>;

/** An untouched form. */
const EMPTY_VALUES: ContactFormValues = {
  name: '',
  email: '',
  organization: '',
  message: '',
};

/**
 * Maximum accepted length of each field.
 *
 * REQ-1.7 forbids proxying the submission, so the browser posts straight to the
 * API and the UI has no place to rate-limit from. What it can do is refuse to
 * amplify: every control carries its cap as a `maxLength`, and the same caps are
 * re-checked in `validateContactForm` so a value pasted past the attribute — or
 * assembled by a script — is still rejected before a request is made
 * (RISK-016). The values are generous for a real message and far below what
 * would make the endpoint a useful payload carrier.
 */
export const MAX_LENGTHS = {
  name: 128,
  email: 254,
  organization: 128,
  message: 4000,
} as const;

/**
 * Address pattern the email field must match: a local part, a single `@`, and a
 * dotted domain with a two-character-or-longer final label. It is deliberately
 * the pragmatic form rather than the RFC grammar — the API is the authority on
 * what it accepts, and this check exists to catch the typo (`dana@acme`) before
 * a request is spent on it.
 */
const EMAIL_PATTERN = /^[^\s@]+@[^\s@.]+(\.[^\s@.]+)*\.[^\s@.]{2,}$/;

/**
 * validateContactForm reports which fields of a submission the client rejects.
 *
 * The rules are DES-001's: name and message must be non-empty once trimmed and
 * the email must look like an address (REQ-2.5). The organization is optional
 * and only its length is checked. Every message is a sentence saying what to
 * do, because the failing field is also marked with the danger ring and colour
 * is never allowed to be the only carrier of the meaning.
 *
 * @param values - the current field values, as typed.
 * @returns a map of field name to error sentence; empty when the submission may
 *   be sent.
 */
export function validateContactForm(
  values: ContactFormValues,
): ContactFormErrors {
  const errors: ContactFormErrors = {};
  const name = values.name.trim();
  const email = values.email.trim();
  const organization = values.organization.trim();
  const message = values.message.trim();

  if (name.length === 0) {
    errors.name = 'Enter your name so I know who is writing.';
  } else if (name.length > MAX_LENGTHS.name) {
    errors.name = `Shorten your name to ${MAX_LENGTHS.name} characters or fewer.`;
  }

  if (email.length === 0) {
    errors.email = 'Enter an email address so I can reply.';
  } else if (email.length > MAX_LENGTHS.email || !EMAIL_PATTERN.test(email)) {
    errors.email = 'Enter an email address in the form name@example.com.';
  }

  if (organization.length > MAX_LENGTHS.organization) {
    errors.organization = `Shorten the organization to ${MAX_LENGTHS.organization} characters or fewer.`;
  }

  if (message.length === 0) {
    errors.message = 'Write a message — a sentence on the problem is plenty.';
  } else if (message.length > MAX_LENGTHS.message) {
    errors.message = `Shorten the message to ${MAX_LENGTHS.message} characters or fewer.`;
  }

  return errors;
}

/**
 * toRequest builds the API payload from the entered values.
 *
 * Everything is trimmed, and an organization that is empty after trimming is
 * omitted rather than sent as an empty string, which the API stores as null.
 *
 * @param values - the validated field values.
 * @returns the body of `POST /v1/messages`.
 */
function toRequest(values: ContactFormValues): CreateMessageRequest {
  const organization = values.organization.trim();

  return {
    name: values.name.trim(),
    email: values.email.trim(),
    message: values.message.trim(),
    ...(organization.length > 0 ? { organization } : {}),
  };
}

/** Shown when the request never reached a verdict — a timeout, a 500, no network. */
const TRANSPORT_ERROR =
  'The message could not be sent. Check your connection and try again — nothing you typed has been lost.';

/** Props of the internal field wrapper. */
type FieldProps = {
  /** Identifier tying the label, the control and its error message together. */
  id: string;
  /** Extra classes on the wrapper, used for grid placement. */
  className?: string;
  /** Visible caption of the control. */
  label: string;
  /** Inline hint after the label, used to mark the optional field. */
  hint?: string;
  /** Validation sentence to show, or undefined when the field is valid. */
  error?: string;
  /** Key used by the error element's test id. */
  field: string;
  /** The control itself, rendered by the caller so it keeps its own type. */
  children: (controlProps: {
    id: string;
    'aria-invalid': boolean;
    'aria-describedby': string | undefined;
  }) => ReactNode;
};

/**
 * Field renders one label/control/error stack of the form.
 *
 * The three parts sit closer to each other than the fields do to one another,
 * so the grouping reads without a rule or a box, and the error is wired to the
 * control through `aria-describedby` so it is announced rather than merely
 * shown.
 *
 * @param props - the field's identity, caption, optional hint and error.
 * @returns the field wrapper element.
 */
function Field({
  id,
  className,
  label,
  hint,
  error,
  field,
  children,
}: FieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Label htmlFor={id}>
        {label}
        {hint === undefined ? null : (
          <span className="text-xs font-normal text-text-tertiary">{hint}</span>
        )}
      </Label>
      {children({
        id,
        'aria-invalid': error !== undefined,
        'aria-describedby': error === undefined ? undefined : errorId,
      })}
      {error === undefined ? null : (
        <p
          id={errorId}
          data-testid={`contact-form-error-${field}`}
          className="text-sm text-danger"
        >
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * ContactForm renders the homepage contact section: the four-field form of
 * REQ-2.4 and the client-side validation and submission of REQ-2.5.
 *
 * This is one of the four `"use client"` islands DES-001 allows (REQ-1.6). It
 * is also the only place in the application that writes: `postMessage` posts
 * straight from the browser to `NEXT_PUBLIC_API_BASE_URL`, with no route
 * handler in between (REQ-1.7). That has two consequences the component owns.
 * First, a 400 comes back as data rather than as a throw, so the envelope's
 * `details` is rendered inline next to the form instead of replacing the page
 * with the error boundary — the visitor keeps everything they typed and can
 * correct it. Second, there is no server hop that could rate-limit, so the form
 * refuses to amplify: nothing is sent until the client-side rules pass, every
 * control is length-capped, and the action is disabled for the duration of a
 * request so a double click cannot become two messages (RISK-016).
 *
 * Validation runs on blur and again on submit, and a field that has already
 * failed re-validates as it is corrected, so the error clears as soon as the
 * value is good rather than at the next submit.
 *
 * On success the form is replaced by the confirmation, which repeats the
 * address the reply will go to — that address is the one thing a visitor cannot
 * check afterwards, so it stays on screen.
 *
 * @returns the contact section element.
 */
export function ContactForm() {
  const fieldId = useId();
  const [values, setValues] = useState<ContactFormValues>(EMPTY_VALUES);
  const [errors, setErrors] = useState<ContactFormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);

  /**
   * update records a keystroke and clears a standing error on that field once
   * the value satisfies the rule again.
   *
   * @param field - the field being edited.
   * @returns a change handler for that field's control.
   */
  const update =
    (field: keyof ContactFormValues) =>
    (event: { target: { value: string } }) => {
      const next = { ...values, [field]: event.target.value };
      setValues(next);
      if (errors[field] !== undefined) {
        setErrors({ ...errors, [field]: validateContactForm(next)[field] });
      }
    };

  /**
   * validateOnBlur applies the rules to a single field when it loses focus.
   *
   * @param field - the field that lost focus.
   * @returns a blur handler for that field's control.
   */
  const validateOnBlur = (field: keyof ContactFormValues) => () => {
    setErrors({ ...errors, [field]: validateContactForm(values)[field] });
  };

  /**
   * handleSubmit validates the whole form and, when it passes, posts it.
   *
   * @param event - the form submission event, whose default navigation is
   *   suppressed so the page is never reloaded.
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) {
      return;
    }

    const found = validateContactForm(values);
    setErrors(found);
    setSubmitError(null);
    if (Object.values(found).some((error) => error !== undefined)) {
      return;
    }

    const request = toRequest(values);
    setSubmitting(true);
    try {
      const result = await postMessage(request);
      if (result.status === 'created') {
        setConfirmedEmail(request.email);
        return;
      }
      setSubmitError(result.details);
    } catch {
      setSubmitError(TRANSPORT_ERROR);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section
      id="contact"
      aria-labelledby="contact-heading"
      data-slot="contact-form"
    >
      <SectionHeading
        id="contact-heading"
        eyebrow="Contact"
        heading="Tell me what you are building"
        lede="Hiring for a team that wants agentic development to be production-grade? A sentence on the problem is plenty to start. Everything sent here lands in the same inbox as an email, and I usually reply within a working day."
      />

      {confirmedEmail === null ? (
        <form
          noValidate
          onSubmit={handleSubmit}
          data-testid="contact-form"
          className="mt-6 grid gap-5 sm:grid-cols-2"
        >
          <Field
            id={`${fieldId}-name`}
            field="name"
            label="Name"
            error={errors.name}
          >
            {(control) => (
              <Input
                {...control}
                name="name"
                autoComplete="name"
                maxLength={MAX_LENGTHS.name}
                value={values.name}
                onChange={update('name')}
                onBlur={validateOnBlur('name')}
              />
            )}
          </Field>

          <Field
            id={`${fieldId}-email`}
            field="email"
            label="Email"
            error={errors.email}
          >
            {(control) => (
              <Input
                {...control}
                type="email"
                name="email"
                autoComplete="email"
                maxLength={MAX_LENGTHS.email}
                value={values.email}
                onChange={update('email')}
                onBlur={validateOnBlur('email')}
              />
            )}
          </Field>

          <Field
            id={`${fieldId}-organization`}
            field="organization"
            label="Organization"
            hint="Optional"
            error={errors.organization}
          >
            {(control) => (
              <Input
                {...control}
                name="organization"
                autoComplete="organization"
                placeholder="(Optional)"
                maxLength={MAX_LENGTHS.organization}
                value={values.organization}
                onChange={update('organization')}
                onBlur={validateOnBlur('organization')}
              />
            )}
          </Field>

          <Field
            id={`${fieldId}-message`}
            className="sm:col-span-2"
            field="message"
            label="Message"
            error={errors.message}
          >
            {(control) => (
              <Textarea
                {...control}
                name="message"
                rows={5}
                placeholder="A sentence on the problem is plenty to start."
                maxLength={MAX_LENGTHS.message}
                value={values.message}
                onChange={update('message')}
                onBlur={validateOnBlur('message')}
              />
            )}
          </Field>

          {submitError === null ? null : (
            <p
              role="alert"
              data-testid="contact-form-error-submit"
              className={cn(
                'rounded-md bg-surface px-4 py-3 text-sm text-danger',
                'shadow-[inset_0_0_0_1px_var(--color-danger-ring)]',
                'sm:col-span-2',
              )}
            >
              {submitError}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 sm:col-span-2">
            <Button type="submit" disabled={submitting}>
              {submitting ? 'Sending…' : 'Send message'}
            </Button>
            <span className="text-sm text-text-tertiary">
              Usually replies within a working day.
            </span>
          </div>
        </form>
      ) : (
        <div
          data-testid="contact-form-confirmation"
          className="mt-6 border-t border-border-subtle pt-6"
        >
          <p className="text-base font-medium text-text-primary">
            Thank you — your message is on its way.
          </p>
          <p className="mt-2 text-sm text-text-secondary">
            I will reply to{' '}
            <span className="font-medium text-text-primary">
              {confirmedEmail}
            </span>
            , usually within a working day.
          </p>
        </div>
      )}
    </section>
  );
}
