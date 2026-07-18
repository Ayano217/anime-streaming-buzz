import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://anime-streaming-buzz.pages.dev',
  output: 'static',
  build: {
    format: 'directory'
  },
  markdown: {
    shikiConfig: {
      theme: 'dracula'
    }
  }
});
