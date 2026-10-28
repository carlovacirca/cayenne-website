# Cayenne website

Astro site for Cloudflare. Every page in `src/pages` wraps its designed body from `src/html` in the shared layout `src/layouts/Base.astro`.

- `public/site.css`, `public/site.js`: the shared design system and behaviour (nav, phone menu, sticky course bar, FAQ rows, the AI pill).
- `public/motion.css`, `public/motion.js`: the motion layer (button shimmer, a different entrance for each scroll stop, a slow float on one visual per screen, page transitions). All of it stops for reduced motion.
- `scripts/check-pages.mjs`: checks the built site, every scroll stop exactly one screen, no sideways scroll, no errors.

```
npm install
npm run build
node scripts/check-pages.mjs            # all pages, four screen sizes
npm run dev
```
