import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://anime-streaming-buzz.pages.dev',
  output: 'hybrid',
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
});
