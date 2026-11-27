// The audit analysis brief and the streamed AI call. Every extra context box goes in, item by item, with its id.
import type { AuditDoc } from '../portal/logic';
import { fieldText, qKey, rKey, KIND, stillNeeded, scores, services, autos, OPTIONS, choice, LV, str } from '../portal/logic';

export const CATALOGUE = {
  1: ['Website: one site, redesign and 301 redirects', 'Monthly SEO: weekly blogs and product pages', 'Weekly Google Business Profile management', 'Review engine after every delivery',
    'Marketplaces and Google Shopping from the stock list', 'Social profiles clean-up (one-off)', 'Trade outreach engine', 'Export lead capture and quote reply'],
  2: ['AI-powered CRM: one inbox, customer history, quotes and follow-ups', 'AI product finder and quote drafts', 'Missed-call text-back and instant replies', 'Stock sync and supplier order automations',
    'Dispatch automation: labels and tracking', 'Export quote and paperwork pack', 'Invoice chasing automation', 'Tool connections (accounts, couriers, website)', 'Custom dashboard'],
};

export function brief(d: AuditDoc, auditNo: number): string {
  const questions = d.template.stages.flatMap(s => s.qs.map(q => {
    const key = qKey(q.id), answers: Record<string, string> = {};
    q.f.forEach(f => { const t = fieldText(d, f); if (t) answers[f.label || f.k] = t; });
    return { id: key, section: s.sec, stage: s.name, question: q.t, answers, not_sure: !!d.unsure[key], extra_context: str(d.ctx[key]) };
  }));
  const research = d.research.items.map(f => {
    const key = rKey(f.id), g = d.research.groups.find(x => x.id === f.g);
    return { id: key, group: g ? g.name : f.g, type: KIND[f.k], statement: f.t, checked: d.verdict[f.id] || '', not_sure: !!d.unsure[key], extra_context: str(d.ctx[key]), sources: f.src.map(s => s.url) };
  });
  const payload = {
    audit_number: auditNo, business: d.business, research, questions,
    competitors: d.research.competitors, tasks: (d.tasks || []).filter(t => str(t.task)),
    still_needed: stillNeeded(d).slice(0, 60).map(n => ({ id: n.key, priority: n.pri, item: n.label, so_far: n.sofar })),
    live_rules: { stage_scores: scores(d), services: services(d).map(x => x.n + ' (' + x.fit + ')'), automations: autos(d).map(x => x.n) },
    chosen_options: OPTIONS.map(o => ({ area: o.name, level: choice(d, o) ? choice(d, o) + ' ' + LV[choice(d, o)] : 'skipped' })),
  };
  return `You are the analysis engine for an audit carried out by Cayenne for a small UK business. Section 1 is sales and marketing (website, SEO, Google Business Profile, reviews, socials, marketplaces, ads, leads), starting with where the money comes in. Section 2 is operations (enquiries, product ID and quoting, stock and suppliers, dispatch and export, accounts, team and tools), aimed at an AI-powered CRM, automations, connections between their tools and a custom dashboard. Read all the data and reply with ONLY one JSON object, no prose before or after.

How to read the data:
- Every "extra_context" was written during the audit with the business. It is the most important evidence. Read every one. Where it adds to, qualifies or contradicts a structured answer, the extra context wins. Use it to decide the services and automations, and cite the ids it came from in "evidence".
- "not_sure": true means the answer is rough or missing and must be confirmed. You may use it, but say "to confirm".
- Research "checked": "True" means the business confirmed it, "Not true" means ignore it, "" means not checked yet (say "to confirm" if you rely on it).
- "still_needed" lists what is missing. Priority 1 (not sure, nothing written) matters most, then 2 (not sure, rough answer), then 3 (not answered).
- Shares named with % are percentages of sales.

Rules: plain UK English, short sentences, no em dashes or en dashes, no prices. Use only numbers present in the data; any estimate says "estimate" and shows the sum. Never invent facts. A person always checks product identification and prices; staff approve anything sent to a customer except acknowledgements and tracking updates. Outreach goes to limited companies only, with a clear opt-out.

Services: pick from this list where they fit, using the exact names, or start a name with "Other: " if the evidence strongly supports something not listed.
Section 1: ${CATALOGUE[1].join(' | ')}
Section 2: ${CATALOGUE[2].join(' | ')}

JSON shape:
{
  "summary": "2 or 3 sentences: where the money comes in, and where the biggest gain is",
  "money": [{"channel": "", "share": "% from the data, or 'unknown'", "comment": "one line"}],
  "stages": [{"stage": "stage name", "score": 0-100, "why": "one line", "missing": ["what to ask"]}],
  "services": [{"section": 1, "service": "", "fit": "strong|possible", "why": "with numbers or the owner's words", "evidence": ["q:m2", "r:item"], "first_step": ""}],
  "automations": [{"priority": 1, "section": 2, "name": "", "problem": "in their words with numbers", "trigger": "", "steps": [""], "result": "", "tools": [""], "ai_role": "", "staff_approve": "", "fallback": "", "metric": "how it is measured at 30 and 60 days", "estimate": "time or money with the sum, labelled estimate, or 'needs data'", "confidence": "low|medium|high", "evidence": ["q:o2"]}],
  "ask_next": ["up to 8 plain questions for the owner, most important first, led by priority 1 items"]
}
Give at most 10 services and at most 6 automations, quick wins first, covering both sections.

Audit data:
${JSON.stringify(payload)}`;
}

/* Streams the model's text to the browser as it is written, then hands the whole text to onDone. */
export function streamAnalysis(apiKey: string, prompt: string, onDone: (text: string) => Promise<string>): ReadableStream<Uint8Array> {
  const te = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    async start(ctrl) {
      let all = '';
      try {
        const r = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'anthropic-beta': 'server-side-fallback-2026-07-01', 'content-type': 'application/json' },
          body: JSON.stringify({ model: 'claude-opus-5-5', max_tokens: 12000, fallbacks: 'default', stream: true, messages: [{ role: 'user', content: prompt }] }),
        });
        if (!r.ok || !r.body) { ctrl.enqueue(te.encode('\u0000' + JSON.stringify({ saved: false, error: 'ai ' + r.status }))); ctrl.close(); return; }
        const reader = r.body.getReader(), td = new TextDecoder(); let buf = '';
        for (;;) {
          const { done, value } = await reader.read(); if (done) break;
          buf += td.decode(value, { stream: true });
          let i: number;
          while ((i = buf.indexOf('\n')) > -1) {
            const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
            if (!line.startsWith('data:')) continue;
            try {
              const ev = JSON.parse(line.slice(5).trim());
              if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { all += ev.delta.text; ctrl.enqueue(te.encode(ev.delta.text)); }
              if (ev.type === 'error') throw new Error(ev.error && ev.error.type || 'stream error');
            } catch (e: any) { if (e && e.message && !/JSON/.test(e.message)) throw e; }
          }
        }
        ctrl.enqueue(te.encode('\u0000' + await onDone(all)));
      } catch (e: any) {
        ctrl.enqueue(te.encode('\u0000' + JSON.stringify({ saved: false, error: String(e && e.message || e).slice(0, 200) })));
      }
      ctrl.close();
    },
  });
}

/* tidy the model's JSON: no dashes, sane sizes */
export function tidyResult(text: string): any | null {
  const m = text.match(/\{[\s\S]*\}/);
  try {
    const o = JSON.parse(m ? m[0] : text);
    const fix = (v: any): any => typeof v === 'string' ? v.replace(/\s*[—–]\s*/g, ', ').slice(0, 3000) : Array.isArray(v) ? v.slice(0, 40).map(fix) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, fix(x)])) : v;
    return fix(o);
  } catch { return null; }
}
