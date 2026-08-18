import '@testing-library/jest-dom/vitest';

import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// jsdom is reused across test files, so mounted trees are torn down after every
// test to keep queries scoped to the component under test.
afterEach(() => {
  cleanup();
});
