/**
 * The tagless.foo landing — served by the worker itself. One dark,
 * self-contained page: no external assets, no JS, loads in one round trip
 * (a tag manager landing that itself weighs ~3KB is the point).
 */
export const LANDING = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>tagless</title>
<meta name="description" content="A tag manager built for agents. Your entire tag manager ships less JavaScript than one Meta pixel.">
<style>
  :root {
    --ground: #0e1116; --surface: #161a21; --ink: #e8eaf0; --muted: #97a0b3;
    --accent: #7a96ff; --line: #262b36; --code: #0a0d12;
  }
  * { box-sizing: border-box; margin: 0; }
  body {
    background: var(--ground); color: var(--ink);
    font: 16px/1.65 ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
    padding: 0 24px;
  }
  main { max-width: 680px; margin: 0 auto; padding: 72px 0 96px; }
  .brand { font: 600 15px/1 ui-monospace, "SF Mono", Menlo, monospace; color: var(--muted); letter-spacing: .08em; }
  .brand b { color: var(--accent); font-weight: 600; }
  h1 {
    font-size: clamp(34px, 7vw, 52px); line-height: 1.05; letter-spacing: -.02em;
    margin: 28px 0 20px; font-weight: 750;
  }
  .claim {
    color: var(--muted); font-size: 18px; max-width: 58ch; margin-bottom: 36px;
  }
  .claim strong { color: var(--ink); font-weight: 600; }
  .num { color: var(--accent); font-family: ui-monospace, Menlo, monospace; font-size: .92em; }
  pre {
    background: var(--code); border: 1px solid var(--line); border-radius: 8px;
    padding: 16px 18px; overflow-x: auto;
    font: 13.5px/1.6 ui-monospace, "SF Mono", Menlo, monospace; color: #cbd2e0;
    margin: 10px 0 28px;
  }
  pre .c { color: #626c82; }
  .label { font: 500 11.5px/1 ui-monospace, Menlo, monospace; letter-spacing: .12em; text-transform: uppercase; color: var(--muted); }
  ul { list-style: none; padding: 0; margin: 14px 0 36px; display: grid; gap: 12px; }
  li { padding-left: 20px; position: relative; color: var(--muted); max-width: 62ch; }
  li::before { content: "→"; position: absolute; left: 0; color: var(--accent); }
  li strong { color: var(--ink); font-weight: 600; }
  a { color: var(--accent); text-decoration: none; border-bottom: 1px solid transparent; }
  a:hover { border-bottom-color: var(--accent); }
  footer { margin-top: 56px; padding-top: 20px; border-top: 1px solid var(--line);
    color: var(--muted); font: 13px/1.6 ui-monospace, Menlo, monospace;
    display: flex; gap: 20px; flex-wrap: wrap; }
</style>
</head>
<body>
<main>
  <div class="brand">tagless<b>.foo</b></div>
  <h1>A tag manager built for&nbsp;agents.</h1>
  <p class="claim">Your entire tag manager ships less JavaScript than one Meta pixel. GTM's snippet is <span class="num">~90KB+</span> before a single tag; fbevents.js alone is <span class="num">~110KB</span>. The tagless runtime is <strong><span class="num">&lt;3KB</span> gzipped</strong>, growing only with the integrations you actually use.</p>

  <div class="label">The whole install</div>
  <pre>&lt;script src="https://cdn.tagless.foo/t/&lt;your-site&gt;.js" defer&gt;&lt;/script&gt;</pre>

  <div class="label">How it works</div>
  <ul>
    <li><strong>No UI.</strong> Declarative config in git; the manager is a compiler. Your agent (Claude, ChatGPT — anything that speaks MCP) operates it: <em>plan → approve → apply</em>, Terraform-style.</li>
    <li><strong>No templates.</strong> Agents write integrations on the fly; the community contributes vendor <strong>contracts</strong> — specs + fixtures that CI validates generated code against.</li>
    <li><strong>No vendor SDKs.</strong> Direct mode fires the tracking request itself. Simulate any event and see the exact payloads before anything ships.</li>
  </ul>

  <div class="label">See a compiled container</div>
  <pre>curl https://cdn.tagless.foo/t/demo.js <span class="c"># runtime + GA4 + Meta, ~1.2KB gz</span></pre>

  <div class="label">Open source, deliberately</div>
  <p class="claim" style="margin-top:14px;">tagless is open source by conscious choice, not by default: it was built to prove a shape, and its author won't be its sustained maintainer. It's structured so you don't need him — <strong>the spec is the doc, the CI is the contract, new vendors are YAML + fixtures</strong>, and Apache-2.0 means you never ask permission. If the community takes it further, that's the plan working.</p>

  <footer>
    <span>Apache-2.0</span>
    <a href="https://github.com/74minutos/tagless">GitHub</a>
    <span>pre-alpha</span>
  </footer>
</main>
</body>
</html>`
