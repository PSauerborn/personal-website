import next from 'eslint-config-next';
import nextCoreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';
import prettier from 'eslint-config-prettier';

// `eslint-config-prettier` is applied last so that formatting decisions are
// owned by prettier alone and are never reported twice.
const config = [
  { ignores: ['.next/**', 'node_modules/**', 'next-env.d.ts'] },
  ...next,
  ...nextCoreWebVitals,
  ...nextTypescript,
  prettier,
];

export default config;
