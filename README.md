# tagless

**A tag manager built for agents.**

Your entire tag manager ships less JavaScript than one Meta pixel. GTM's snippet is ~90KB+ before a single tag; `fbevents.js` alone is ~110KB. The tagless runtime targets **<3KB gzipped**, growing only with the integrations you actually use.

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
| `packages/mcp` | The MCP server — the only management interface. (stub) |
| `specs/` | Vendor spec contracts + fixtures (GA4, Meta so far). |
| `examples/demo` | A full `tracking.config.yaml` you can compile today. |

## Try it

```bash
npm install
npm run size     # compiles examples/demo and prints the gzipped bundle size
```

## Status

Pre-alpha scaffold. See [SPEC.md](SPEC.md) for the full v0.1 design: MCP surface, config format, vendor spec contract, non-goals, roadmap.

## License

[Apache-2.0](LICENSE)
