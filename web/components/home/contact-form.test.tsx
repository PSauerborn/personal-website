import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ContactForm,
  validateContactForm,
} from '@/components/home/contact-form';
import { ApiError } from '@/lib/api/client';

/**
 * The messages module is the only collaborator of the island. It is mocked so
 * the assertions can pin the two things the acceptance criteria care about:
 * that an invalid submission never reaches it (AC-5), and that a valid one is
 * handed exactly the trimmed payload the API expects (AC-4, PC-7).
 */
const postMessage = vi.hoisted(() => vi.fn());

vi.mock('@/lib/api/messages', () => ({ postMessage }));

/** A submission that passes every client-side rule. */
const VALID = {
  name: 'Test McLovin',
  email: 'test@example.com',
  organization: 'Acme Logistics',
  message: 'Hello, this is a test message.',
};

/**
 * fillForm types a value into each named field of the mounted form.
 *
 * @param values - the values to enter, keyed by field label.
 */
function fillForm(values: Partial<typeof VALID>): void {
  const labels = {
    name: /^name$/i,
    email: /^email$/i,
    organization: /^organization/i,
    message: /^message$/i,
  } as const;

  for (const [field, value] of Object.entries(values)) {
    const control = screen.getByLabelText(labels[field as keyof typeof labels]);
    fireEvent.change(control, { target: { value } });
  }
}

/** submit clicks the form's submit action. */
function submit(): void {
  fireEvent.click(screen.getByRole('button', { name: /send message/i }));
}

describe('validateContactForm', () => {
  it('accepts a complete submission', () => {
    expect(validateContactForm(VALID)).toEqual({});
  });

  it('rejects a name that is empty after trimming', () => {
    expect(validateContactForm({ ...VALID, name: '   ' }).name).toBeTruthy();
  });

  it('rejects a message that is empty after trimming', () => {
    expect(
      validateContactForm({ ...VALID, message: '  \n ' }).message,
    ).toBeTruthy();
  });

  it('rejects a malformed email address', () => {
    expect(
      validateContactForm({ ...VALID, email: 'dana@acme' }).email,
    ).toBeTruthy();
  });

  it('accepts an absent organization', () => {
    expect(validateContactForm({ ...VALID, organization: '' })).toEqual({});
  });

  it('rejects values beyond the maximum accepted length', () => {
    expect(
      validateContactForm({ ...VALID, message: 'a'.repeat(100_000) }).message,
    ).toBeTruthy();
  });
});

describe('ContactForm', () => {
  beforeEach(() => {
    postMessage.mockReset();
  });

  it('renders the four fields with organization marked optional (AC-3)', () => {
    render(<ContactForm />);

    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^email$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/^message$/i)).toBeInTheDocument();

    const organization = screen.getByLabelText(/^organization/i);
    expect(organization).toBeInTheDocument();
    expect(organization).not.toBeRequired();
    expect(screen.getByText(/optional/i)).toBeInTheDocument();
  });

  it('anchors the section at the id the header targets', () => {
    const { container } = render(<ContactForm />);

    expect(container.querySelector('#contact')).not.toBeNull();
  });

  it.each([
    ['name', { ...VALID, name: '   ' }],
    ['email', { ...VALID, email: 'dana@acme' }],
    ['message', { ...VALID, message: '   ' }],
  ])(
    'blocks submission and shows an inline error for an invalid %s (AC-5)',
    async (field, values) => {
      render(<ContactForm />);
      fillForm(values);
      submit();

      const control = screen.getByLabelText(new RegExp(`^${field}`, 'i'));
      await waitFor(() => {
        expect(control).toHaveAttribute('aria-invalid', 'true');
      });
      expect(
        screen.getByTestId(`contact-form-error-${field}`),
      ).toBeInTheDocument();
      expect(postMessage).not.toHaveBeenCalled();
    },
  );

  it('validates a field on blur before any submission', async () => {
    render(<ContactForm />);

    const email = screen.getByLabelText(/^email$/i);
    fireEvent.change(email, { target: { value: 'dana@acme' } });
    fireEvent.blur(email);

    await waitFor(() => {
      expect(
        screen.getByTestId('contact-form-error-email'),
      ).toBeInTheDocument();
    });
    expect(postMessage).not.toHaveBeenCalled();
  });

  it('posts the trimmed submission and confirms with the email visible (AC-4)', async () => {
    postMessage.mockResolvedValue({ status: 'created', messageId: 'msg-1' });
    render(<ContactForm />);

    fillForm({
      ...VALID,
      name: '  Test McLovin  ',
      email: ' test@example.com ',
    });
    submit();

    await waitFor(() => {
      expect(
        screen.getByTestId('contact-form-confirmation'),
      ).toBeInTheDocument();
    });
    expect(postMessage).toHaveBeenCalledWith({
      name: 'Test McLovin',
      email: 'test@example.com',
      organization: 'Acme Logistics',
      message: 'Hello, this is a test message.',
    });
    expect(screen.getByText(/test@example\.com/)).toBeInTheDocument();
    expect(screen.queryByLabelText(/^message$/i)).not.toBeInTheDocument();
  });

  it('omits an empty organization from the payload', async () => {
    postMessage.mockResolvedValue({ status: 'created', messageId: 'msg-1' });
    render(<ContactForm />);

    fillForm({ ...VALID, organization: '   ' });
    submit();

    await waitFor(() => expect(postMessage).toHaveBeenCalledTimes(1));
    expect(postMessage.mock.calls[0][0]).not.toHaveProperty('organization');
  });

  it('renders the rejection details inline and preserves every entered value', async () => {
    postMessage.mockResolvedValue({
      status: 'rejected',
      details: 'email: value is not a valid email address',
    });
    render(<ContactForm />);

    fillForm(VALID);
    submit();

    await waitFor(() => {
      expect(
        screen.getByText(/value is not a valid email address/),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^name$/i)).toHaveValue(VALID.name);
    expect(screen.getByLabelText(/^email$/i)).toHaveValue(VALID.email);
    expect(screen.getByLabelText(/^organization/i)).toHaveValue(
      VALID.organization,
    );
    expect(screen.getByLabelText(/^message$/i)).toHaveValue(VALID.message);
  });

  it('renders an inline error and preserves input when the request fails', async () => {
    postMessage.mockRejectedValue(new ApiError('the API is unreachable'));
    render(<ContactForm />);

    fillForm(VALID);
    submit();

    await waitFor(() => {
      expect(
        screen.getByTestId('contact-form-error-submit'),
      ).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^message$/i)).toHaveValue(VALID.message);
  });

  it('disables the submit action while a request is in flight', async () => {
    let release = (): void => {};
    postMessage.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve({ status: 'created', messageId: 'msg-1' });
        }),
    );
    render(<ContactForm />);

    fillForm(VALID);
    submit();

    const action = screen.getByRole('button', { name: /sending/i });
    await waitFor(() => expect(action).toBeDisabled());

    fireEvent.click(action);
    fireEvent.submit(screen.getByTestId('contact-form'));
    expect(postMessage).toHaveBeenCalledTimes(1);

    release();
    await waitFor(() => {
      expect(
        screen.getByTestId('contact-form-confirmation'),
      ).toBeInTheDocument();
    });
  });

  it('caps the length of every input', () => {
    render(<ContactForm />);

    for (const label of [
      /^name$/i,
      /^email$/i,
      /^organization/i,
      /^message$/i,
    ]) {
      expect(screen.getByLabelText(label)).toHaveAttribute('maxLength');
    }
  });
});
