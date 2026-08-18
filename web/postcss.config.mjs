/**
 * PostCSS configuration.
 *
 * Tailwind CSS v4 is wired in as a PostCSS plugin; the theme itself lives in
 * the application stylesheet rather than in a JavaScript config file.
 */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;
