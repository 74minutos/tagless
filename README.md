# tagless

**A tag manager built for agents.** — [tagless.foo](https://tagless.foo)

Your entire tag manager ships less JavaScript than one Meta pixel. GTM's snippet is ~90KB+ before a single tag; `fbevents.js` alone is ~110KB. The tagless runtime targets **<3KB gzipped**, growing only with the integrations you actually use. Not a claim — a live artifact:

```bash
curl https://cdn.tagless.foo/t/demo.js   # a full container: runtime + GA4 + Meta, 2,317 bytes raw
```

There is no UI. The manager is a **compiler** (declarative config in git → tree-shaken browser bundle) plus an **MCP server** (`plan` → approve → `apply`, Terraform-style) that any agent — Claude, ChatGPT, or your own — operates on your behalf: *"install GA4 and the Meta pixel on my site"*, and it happens — reviewed, tested, simulated before it ships.

## How it works

```
tracking.config.yaml ──▶ compiler ──▶ dist/t.js  (client target, zero infra)
        ▲                        └──▶ edge worker (optional hybrid target)
        │
   MCP server  ◀── your agent (plan / apply / simulate / audit / import_gtm)
```

- **Config in git** is the single source of truth. No workspaces, no versions UI — diffs and PRs.
- **Client-first.** The default target is a pure-browser bundle. A server is an upgrade path, never a requirement. The same config compiles Meta to a direct pixel on client-only and to CAPI on hybrid.
- **Specs, not templates.** The agent writes integration code on the fly; the community contributes vendor *contracts* (endpoint, fields, PII hashing, consent, placements) plus fixtures that CI validates generated code against. See [`specs/`](specs/).

## Repo layout

| Path | What |
|---|---|
| `packages/runtime` | The browser core: event bus, consent gate, transport. The <3KB budget lives here. |
| `packages/compiler` | Config → minified IIFE bundle via esbuild. Vendor code generators. |
| `packages/mcp` | The MCP server — the only management interface. All eight tools working over stdio: `init_site`, `import_gtm`, `plan`, `apply`, `simulate`, `publish_hosted`, `rollback`, `search_specs`. |
| `packages/simulator` | vm sandbox: run a compiled bundle, capture every outgoing request. Powers `simulate` and the fixture CI. |
| `packages/cdn-worker` | Hosted mode: the Cloudflare Worker behind `cdn.tagless.foo` — immutable snippet URL, versioned bundles, instant rollback. Also serves [tagless.foo](https://tagless.foo). |
| `specs/` | Vendor spec contracts + fixtures (GA4, Meta, TikTok). |
| `examples/demo` | A full `tracking.config.yaml` you can compile today — the same one live at `/t/demo.js`. |

## Try it

```bash
npm install
npm run size       # compiles examples/demo and prints the gzipped bundle size
npm test           # runs every vendor spec fixture against the generators
npm run mcp:smoke  # end-to-end MCP client: plan → simulate → apply
```

Point your agent at the MCP server:

```json
{ "mcpServers": { "tagless": { "command": "node", "args": ["packages/mcp/src/index.js"] } } }
```

## Status

Pre-alpha, but real: the hosted CDN is live, the first production site runs on it (a Next.js site migrated off walkerOS — its whole tracking layer is 1.9KB gzipped), and every capability above is covered by the fixture/lifecycle CI (`npm test`). See [SPEC.md](SPEC.md) for the full design: MCP surface, config format, vendor spec contract, non-goals, roadmap.

## License

[Apache-2.0](LICENSE)
