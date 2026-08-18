import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ErrorBoundary from './error';

/**
 * The boundary module's own text. The `"use client"` assertion is about the
 * source rather than the transformed module, so the file is read from disk;
 * Vitest runs from the application root.
 */
const errorSource = readFileSync(resolve('app/error.tsx'), 'utf8');

/**
 * stackTrace is the kind of internal detail a thrown error carries. It is kept
 * here so the "nothing leaks" assertions test a realistic payload rather than
 * an empty string that would pass trivially.
 */
const stackTrace =
  'TypeError: fetch failed\n    at getCurriculumVitae (lib/api/client.ts:42:11)';

/**
 * buildError returns an `Error` shaped the way Next.js hands one to an error
 * boundary: a message, a stack, and — for errors thrown on the server — the
 * `digest` hash that correlates the client render with the server log.
 *
 * @param digest - the server digest to attach; omitted for a client-side throw.
 * @returns the error to pass as the boundary's `error` prop.
 */
function buildError(digest?: string): Error & { digest?: string } {
  const error: Error & { digest?: string } = new Error('fetch failed');
  error.stack = stackTrace;

  if (digest !== undefined) {
    error.digest = digest;
  }

  return error;
}

describe('ErrorBoundary', () => {
  it('renders the DES-001 amber caps label', () => {
    render(<ErrorBoundary error={buildError('8f2c41')} reset={vi.fn()} />);

    expect(screen.getByText('Error')).toHaveClass('text-warning');
  });

  it('renders the statement as the page heading', () => {
    render(<ErrorBoundary error={buildError('8f2c41')} reset={vi.fn()} />);

    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'This page could not be loaded',
    );
  });

  it('says plainly that the fault is not the reader’s', () => {
    render(<ErrorBoundary error={buildError('8f2c41')} reset={vi.fn()} />);

    expect(screen.getByText(/nothing is broken on your side/i)).toBeVisible();
  });

  it('renders the reference string from the error digest in monospace', () => {
    render(<ErrorBoundary error={buildError('8f2c41')} reset={vi.fn()} />);

    const reference = screen.getByText(/reference:/i);

    expect(reference).toHaveTextContent('reference: 8f2c41');
    expect(reference).toHaveClass('font-mono');
  });

  it('falls back to a stable placeholder reference when there is no digest', () => {
    render(<ErrorBoundary error={buildError()} reset={vi.fn()} />);

    expect(screen.getByText(/reference:/i)).toHaveTextContent(
      'reference: unavailable',
    );
  });

  it('calls reset when "Try again" is clicked', () => {
    const reset = vi.fn();

    render(<ErrorBoundary error={buildError('8f2c41')} reset={reset} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(reset).toHaveBeenCalledOnce();
  });

  it('prefers retry over reset when the framework supplies both', () => {
    const retry = vi.fn();
    const reset = vi.fn();

    render(
      <ErrorBoundary
        error={buildError('8f2c41')}
        retry={retry}
        reset={reset}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));

    expect(retry).toHaveBeenCalledOnce();
    expect(reset).not.toHaveBeenCalled();
  });

  it('offers the homepage as the secondary destination', () => {
    render(<ErrorBoundary error={buildError('8f2c41')} reset={vi.fn()} />);

    expect(screen.getByRole('link', { name: /homepage/i })).toHaveAttribute(
      'href',
      '/',
    );
  });

  it('renders neither the stack trace nor the raw error message', () => {
    const { container } = render(
      <ErrorBoundary error={buildError('8f2c41')} reset={vi.fn()} />,
    );

    expect(container.textContent).not.toContain('fetch failed');
    expect(container.textContent).not.toContain('lib/api/client.ts');
    expect(container.textContent).not.toContain('TypeError');
  });

  it('renders a section rather than re-declaring the layout shell', () => {
    const { container } = render(
      <ErrorBoundary error={buildError('8f2c41')} reset={vi.fn()} />,
    );

    expect(container.querySelector('section')).not.toBeNull();
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });

  it('carries "use client" and records its PC-6 exclusion', () => {
    expect(errorSource).toContain('use client');
    expect(errorSource).toContain('PC-6');
  });
});
