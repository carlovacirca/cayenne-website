// Static pages, served by Cloudflare Pages. The adapter lets src/pages/api/* run as server endpoints.
import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';

export default defineConfig({
  output: 'static',
  adapter: cloudflare(),
  build: { format: 'file' },
  trailingSlash: 'never',
});
