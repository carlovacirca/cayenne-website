// The Worker: Astro serves every request, and the morning timer writes the Insights draft.
import { handle } from '@astrojs/cloudflare/handler';
import { morning } from './lib/insights';

export default {
  fetch: handle,
  async scheduled(_event: ScheduledController, _env: unknown, ctx: ExecutionContext) {
    ctx.waitUntil(morning().catch(e => console.error('insights morning run failed', e)));
  },
};
