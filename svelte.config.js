import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

const output = process.env.PAGES_OUTPUT ?? 'build';

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      pages: output,
      assets: output,
      fallback: '404.html'
    }),
    paths: {
      base: process.env.BASE_PATH ?? ''
    }
  }
};

export default config;
