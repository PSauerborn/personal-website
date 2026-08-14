import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import NotFound from './not-found';

/**
 * The page module's own text. The client-directive assertion is about the
 * source rather than the transformed module, so the file is read from disk;
 * Vitest runs from the application root.
 */
const notFoundSource = readFileSync(resolve('app/not-found.tsx'), 'utf8');

describe('NotFound', () => {
  it('renders the DES-001 404 caps label', () => {
    render(<NotFound />);

    expect(screen.getByText('404')).toBeInTheDocument();
  });

  it('renders the statement as the page heading', () => {
    render(<NotFound />);

    const statement = screen.getByRole('heading', { level: 1 });

    expect(statement).toHaveTextContent('There is nothing at this address');
  });

  it('explains what to do next in body copy', () => {
    render(<NotFound />);

    expect(
      screen.getByText(/the address may have changed/i),
    ).toBeInTheDocument();
  });

  it('offers a link back to the homepage', () => {
    render(<NotFound />);

    expect(
      screen.getByRole('link', { name: 'Back to the homepage' }),
    ).toHaveAttribute('href', '/');
  });

  it('offers the writing archive as the secondary destination', () => {
    render(<NotFound />);

    expect(
      screen.getByRole('link', { name: /writing archive/i }),
    ).toHaveAttribute('href', '/blog');
  });

  it('renders a section rather than re-declaring the layout shell', () => {
    const { container } = render(<NotFound />);

    expect(container.querySelector('section')).not.toBeNull();
    expect(container.querySelector('main')).toBeNull();
    expect(container.querySelector('header')).toBeNull();
    expect(container.querySelector('footer')).toBeNull();
  });

  it('is a Server Component', () => {
    expect(notFoundSource).not.toContain('use client');
  });
});
