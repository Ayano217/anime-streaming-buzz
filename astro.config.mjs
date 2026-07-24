import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

// https://astro.build/config
export default defineConfig({
  site: 'https://anime-streaming-buzz.pages.dev',
  output: 'hybrid',
  adapter: cloudflare({
    mode: 'directory',
    functionPerRoute: false,
  }),
  trailingSlash: 'ignore',
  build: {
    format: 'directory',
  },
  vite: {
    ssr: {
      external: ['node:buffer', 'node:path', 'node:url', 'node:fs'],
    },
  },
});
