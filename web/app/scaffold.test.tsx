import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import nextConfig from '@/next.config';

/**
 * Scaffold-level checks on the toolchain itself, not on any application
 * component: that the jsdom environment, React Testing Library and the
 * jest-dom matchers registered in `vitest.setup.ts` are wired up, that the
 * `@/*` path alias resolves under the test runner as it does under `next
 * build`, and that the standalone build output the production image depends on
 * is still configured.
 */
describe('scaffold', () => {
  it('renders React components into the jsdom environment', () => {
    render(<p>scaffold harness</p>);

    expect(screen.getByText('scaffold harness')).toBeInTheDocument();
  });

  it('resolves the @/* path alias to the application root', () => {
    expect(nextConfig).toBeDefined();
  });

  it('builds a standalone server bundle for the production image', () => {
    expect(nextConfig.output).toBe('standalone');
  });
});
