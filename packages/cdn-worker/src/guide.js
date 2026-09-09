/**
 * The end-to-end guide — tagless.foo/guide. Same editorial style as the
 * landing, same self-contained discipline: no external assets, no JS.
 */
export const GUIDE = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tagless — the guide</title>
<meta name="description" content="tagless end to end: install, the agent loop, main use cases, gotchas, and how to keep agent token spend low.">
<style>
  :root {
    --paper: #ffffff; --ink: #1a1a1a; --muted: #6f6f6f; --faint: #9b9b9b;
    --sand: #f3ecdf; --sand-ink: #40382c; --sand-deep: #d9c9ae; --line: #ebe7df;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--paper); color: var(--ink);
    font: 17px/1.7 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, sans-serif;
    padding: 0 24px;
  }
  main { max-width: 640px; margin: 0 auto; padding: 72px 0 96px; }
  .eyebrow { font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase; color: var(--faint); margin-bottom: 22px; }
  .eyebrow a { color: var(--faint); text-decoration: none; }
  h1 { font-size: clamp(34px, 7vw, 48px); font-weight: 800; line-height: 1.06; letter-spacing: -.025em; margin-bottom: 14px; }
  .sub { font-size: 20px; line-height: 1.5; color: var(--muted); max-width: 44ch; margin-bottom: 36px; }
  .dots { height: 14px; margin: 4px 0 44px;
    background-image: radial-gradient(circle, var(--sand-deep) 2.6px, transparent 3.2px);
    background-size: 19px 14px; background-position: 0 50%;
    -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 35%, transparent 95%);
    mask-image: linear-gradient(90deg, #000 0%, #000 35%, transparent 95%); }
  h2 { font-size: 24px; font-weight: 800; letter-spacing: -.015em; margin: 52px 0 14px; }
  h3 { font-size: 16.5px; font-weight: 700; margin: 30px 0 8px; }
  p { color: var(--ink); max-width: 62ch; margin-bottom: 14px; }
  p.quiet, li { color: var(--muted); }
  .say { font-style: italic; color: var(--ink); }
  .chain { font: 13px/1.6 ui-monospace, "SF Mono", Menlo, monospace; color: var(--sand-ink); background: var(--sand); border-radius: 6px; padding: 3px 9px; display: inline-block; margin: 2px 0 10px; }
  pre { background: var(--sand); color: var(--sand-ink); border-radius: 10px; padding: 16px 18px; overflow-x: auto; margin: 12px 0 18px; font: 13px/1.6 ui-monospace, "SF Mono", Menlo, monospace; }
  pre .c { color: #9a8c72; }
  code { font: .88em ui-monospace, Menlo, monospace; background: var(--sand); color: var(--sand-ink); padding: 1px 6px; border-radius: 4px; }
  ul { list-style: none; padding: 0; margin: 10px 0 18px; display: grid; gap: 11px; }
  li { max-width: 62ch; padding-left: 20px; position: relative; }
  li::before { content: "·"; position: absolute; left: 4px; color: var(--sand-deep); font-weight: 800; }
  li strong { color: var(--ink); }
  a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--sand-deep); text-decoration-thickness: 2px; }
  footer { margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--line); color: var(--faint); font-size: 13.5px; display: flex; gap: 22px; flex-wrap: wrap; }
  footer a { color: var(--faint); }
</style>
</head>
<body>
<main>
  <div class="eyebrow"><a href="/">tagless.foo</a> / guide</div>
  <h1>End to end, honestly.</h1>
  <p class="sub">From the one-line install to the agent conversations you'll actually have — including the gotchas and how to keep your agent's token bill low.</p>
  <div class="dots" role="presentation"></div>

  <h2>1 · Install</h2>
  <p><strong>Hosted mode</strong> (the default): paste this once. The URL never changes; every change afterwards is your agent republishing bundles behind it.</p>
  <pre>&lt;script src="https://cdn.tagless.foo/t/&lt;your-site&gt;.js" defer&gt;&lt;/script&gt;</pre>
  <p><strong>Repo mode</strong> (you have a deploy pipeline): <code>apply</code> compiles to a static file you serve first-party — same origin, invisible to ad-blockers. This is what the first production site runs.</p>
  <p>Then wire two things in your page:</p>
  <pre><span class="c">// 1. your CMP's callback — events queue silently until this fires</span>
tagless.setConsent({ analytics: true, marketing: false })

<span class="c">// 2. your business events — dataLayer keeps working as-is (GTM compat),</span>
<span class="c">//    or call the API directly:</span>
tagless.track('purchase', { value: 49.9, currency: 'EUR', items: [...] })</pre>

  <h2>2 · Connect your agent</h2>
  <pre>{ "mcpServers": { "tagless": {
    "command": "node", "args": ["packages/mcp/src/index.js"] } } }</pre>
  <p>Eight tools: <code>init_site</code>, <code>import_gtm</code>, <code>find_element</code>, <code>plan</code>, <code>simulate</code>, <code>apply</code>, <code>publish_hosted</code>, <code>rollback</code>, <code>search_specs</code>. The contract behind all of them: <strong>nothing ships without a plan, and a plan is invalidated by any config change.</strong> <code>apply</code> requires the <code>plan_id</code> of the exact current config — your approval always refers to what actually ships.</p>

  <h2>3 · The conversations</h2>

  <h3>"Migrate my GTM container"</h3>
  <span class="chain">import_gtm → review report → plan → simulate → apply</span>
  <p class="quiet">Export the container (GTM Admin → Export), hand the JSON to the agent. It maps GA4 tags, pixels hidden in custom HTML, dataLayer/cookie/URL/lookup-table variables and click triggers — and reports everything else with a reason instead of guessing. Review the <code>unmapped</code> list before shipping; that's where the custom JS lives.</p>

  <h3>"Add the Meta pixel"</h3>
  <span class="chain">search_specs → edit config → plan → simulate → apply</span>
  <p class="quiet">The plan shows the byte delta (+~400B, not +416KB of fbevents.js) and the simulate shows the exact <code>/tr</code> request — with <code>fbp</code>, advanced matching hashes, consent gating — before anything is live.</p>

  <h3>"Track clicks on that button — I don't know what element it is"</h3>
  <span class="chain">find_element → paste config block → simulate → apply</span>
  <p class="quiet">Describe it in plain words. <code>find_element</code> scans the live page, scores the clickable candidates, and returns a uniqueness-verified selector plus the ready-to-paste <code>source: dom</code> block. If the selector matches two identical CTAs, that's reported as a feature — you usually want both, and <code>{{element.text}}</code> disambiguates.</p>

  <h3>"Why isn't X firing?"</h3>
  <span class="chain">simulate (with the real consent state)</span>
  <p class="quiet">Ninety percent of the time the answer is consent: default is <code>denied</code> and events queue silently until <code>setConsent</code> runs. Simulate with <code>{ marketing: false }</code> and watch the ad pixels disappear — if that matches what you see in production, the system is working, not broken.</p>

  <h3>"Undo that"</h3>
  <span class="chain">rollback</span>
  <p class="quiet">Every publish is an immutable version; the alias just points at one. Rolling back is repointing — instant, no rebuild, and the bad version stays inspectable forever.</p>

  <h2>4 · Gotchas</h2>
  <ul>
    <li><strong>Silence before consent is correct.</strong> The #1 "bug report". Watch the network tab go from zero to fan-out when the banner is accepted.</li>
    <li><strong>New events need routing.</strong> Adding an event to <code>events:</code> doesn't send it anywhere — add it to each destination's <code>events:</code> list too. The plan shows the routing table; read it.</li>
    <li><strong>Vendors discard invalid ids silently.</strong> A fake pixel id produces perfect-looking requests and zero data. Validate in GA4 DebugView / Meta Test Events before trusting anything.</li>
    <li><strong>setUser is async.</strong> Hashing happens before storage — <code>await tagless.setUser({email})</code> before the track call that needs the match data.</li>
    <li><strong>find_element sees server-rendered HTML only.</strong> Client-rendered SPA elements are invisible to it; inspect the running page for those.</li>
    <li><strong>TikTok direct mode is experimental.</strong> Its browser wire format isn't officially documented. Verify in TikTok Events Manager; the documented path is the server-side Events API.</li>
    <li><strong>Enhanced conversions & GA4 user-provided data are server-side.</strong> No public client wire format exists — tagless won't fake one. They arrive with the hybrid target.</li>
    <li><strong>The alias caches for 5 minutes.</strong> A publish is live within minutes, not seconds. The versioned URL (<code>…@plan_id.js</code>) is immediate if you need to verify right now.</li>
    <li><strong>Site-local modules bill separately.</strong> The &lt;3KB budget covers tagless's world; your custom collector's bytes are yours.</li>
  </ul>

  <h2>5 · Keeping the agent bill low</h2>
  <p class="quiet">tagless was designed to be cheap to operate by an LLM. The whole surface is built around a few dense calls:</p>
  <ul>
    <li><strong>The config is the only file worth reading.</strong> Everything else is generated. Never load <code>dist/t.js</code>, the bundle, or vendor SDKs into context — <code>simulate</code> already tells you what the compiled code does.</li>
    <li><strong>One simulate answers most questions.</strong> It returns every outgoing request with parsed payloads for any events + consent state you pass. That's the debugger, the validator and the docs in a single call — don't curl endpoints one by one.</li>
    <li><strong>plan → apply as a pair.</strong> The <code>plan_id</code> is a deterministic hash of the config: no config change, no need to re-plan. Batch all your edits, then plan once, apply once.</li>
    <li><strong>search_specs before vendor docs.</strong> For registered vendors the contract (endpoints, consent, fields, modes) is a local lookup — no web fetches, no doc pages in context.</li>
    <li><strong>find_element returns a paste-ready block.</strong> Don't re-derive selectors or hand-write the event config; the tool output is the artifact.</li>
    <li><strong>import_gtm once.</strong> The report + draft config are the durable output; work from them instead of re-reading the container export.</li>
  </ul>

  <footer>
    <a href="/">tagless.foo</a>
    <a href="https://github.com/74minutos/tagless">GitHub</a>
    <span>Apache-2.0</span>
  </footer>
</main>
</body>
</html>`
