/**
 * The tagless.foo landing — served by the worker itself. One light,
 * editorial, self-contained page: no external assets, no JS, loads in one
 * round trip (a tag manager landing that itself weighs ~4KB is the point).
 * Single-theme by choice; every color painted explicitly.
 */
export const LANDING = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tagless</title>
<meta name="description" content="A tag manager built for agents. So lightweight it ships 1% of the JavaScript of a traditional tag manager.">
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
  main { max-width: 640px; margin: 0 auto; padding: 88px 0 96px; }
  .eyebrow {
    font-size: 12px; font-weight: 600; letter-spacing: .14em; text-transform: uppercase;
    color: var(--faint); margin-bottom: 26px;
  }
  h1 {
    font-size: clamp(40px, 8.5vw, 62px); font-weight: 800; line-height: 1.04;
    letter-spacing: -.028em; color: var(--ink); margin-bottom: 18px;
  }
  .sub {
    font-size: 21px; line-height: 1.5; color: var(--muted); font-weight: 400;
    max-width: 34ch; margin-bottom: 40px;
  }
  .sub a { color: var(--muted); }
  .dots {
    height: 14px; margin: 8px 0 48px;
    background-image: radial-gradient(circle, var(--sand-deep) 2.6px, transparent 3.2px);
    background-size: 19px 14px; background-position: 0 50%;
    -webkit-mask-image: linear-gradient(90deg, #000 0%, #000 35%, transparent 95%);
    mask-image: linear-gradient(90deg, #000 0%, #000 35%, transparent 95%);
  }
  h2 {
    font-size: 15px; font-weight: 700; letter-spacing: .01em;
    margin: 44px 0 12px; color: var(--ink);
  }
  p { color: var(--ink); max-width: 60ch; margin-bottom: 14px; }
  p.quiet { color: var(--muted); font-size: 16px; }
  pre {
    background: var(--sand); color: var(--sand-ink); border-radius: 10px;
    padding: 18px 20px; overflow-x: auto; margin: 14px 0 8px;
    font: 13.5px/1.6 ui-monospace, "SF Mono", Menlo, monospace;
  }
  pre .c { color: #9a8c72; }
  ul { list-style: none; padding: 0; margin: 12px 0 8px; display: grid; gap: 14px; }
  li { color: var(--muted); max-width: 60ch; }
  li strong { color: var(--ink); font-weight: 700; }
  a { color: var(--ink); text-decoration: underline; text-underline-offset: 3px; text-decoration-color: var(--sand-deep); text-decoration-thickness: 2px; }
  a:hover { text-decoration-color: var(--ink); }
  .num { font-variant-numeric: tabular-nums; font-weight: 600; color: var(--ink); }
  footer {
    margin-top: 64px; padding-top: 22px; border-top: 1px solid var(--line);
    color: var(--faint); font-size: 13.5px; display: flex; gap: 22px; flex-wrap: wrap;
  }
  footer a { color: var(--faint); }
</style>
</head>
<body>
<main>
  <div class="eyebrow">tagless.foo</div>
  <h1>A tag manager built for&nbsp;agents.</h1>
  <p class="sub">So lightweight it ships <span class="num">1%</span> of the JavaScript of a traditional tag manager — <a href="https://github.com/74minutos/tagless/blob/main/docs/size.md">measured, not marketed</a>.</p>
  <div class="dots" role="presentation"></div>

  <p>A real container with seven destinations — GA4, Google Ads, Meta, TikTok, LinkedIn, Hotjar and a first-party collector — compiles to <span class="num">4.2KB</span> gzipped. The vendor SDKs a traditional setup loads for the same stack weigh <span class="num">908KB</span>, before the tag manager itself. There is no UI, no templates, no interpreter shipped to your visitors: config lives in git, a compiler emits only the code your tags need, and your agent — Claude, ChatGPT, anything that speaks MCP — operates it: <em>plan → approve → apply</em>.</p>

  <h2>The whole install</h2>
  <pre>&lt;script src="https://cdn.tagless.foo/t/&lt;your-site&gt;.js" defer&gt;&lt;/script&gt;</pre>

  <h2>How it works</h2>
  <ul>
    <li><strong>No UI.</strong> Declarative config in git; the manager is a compiler. Your agent plans, you approve, it ships — Terraform-style, with the exact network payloads and the byte delta in the diff.</li>
    <li><strong>No templates.</strong> Agents write integrations on the fly; the community contributes vendor <strong>contracts</strong> — specs and fixtures that CI validates generated code against.</li>
    <li><strong>No vendor SDKs.</strong> Direct mode fires the tracking request itself, at parity with what the SDKs send: consent gating, advanced matching, sessions, click ids, ecommerce items.</li>
  </ul>

  <h2>See a compiled container</h2>
  <pre>curl https://cdn.tagless.foo/t/demo.js <span class="c"># runtime + GA4 + Meta, ~2.5KB gz</span></pre>

  <h2>Open source, deliberately</h2>
  <p class="quiet">tagless is open source by conscious choice, not by default: it was built to prove a shape, and its author won't be its sustained maintainer. It's structured so you don't need him — the spec is the doc, the CI is the contract, new vendors are YAML plus fixtures, and Apache-2.0 means you never ask permission. If the community takes it further, that's the plan working.</p>

  <footer>
    <span>Apache-2.0</span>
    <a href="https://github.com/74minutos/tagless">GitHub</a>
    <span>pre-alpha</span>
  </footer>
</main>
</body>
</html>`
