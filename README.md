# tagless

**A tag manager built for agents.** — [tagless.foo](https://tagless.foo)

**1% of the JavaScript. 100% run by your agent.** A real 7-destination container (GA4, Google Ads, Meta, TikTok, LinkedIn, first-party collector) compiles to 4.2KB gzipped; the vendor SDKs GTM loads for the same stack are 908KB — before gtm.js itself. Measured and reproducible: [docs/size.md](docs/size.md). Not a claim — a live artifact:

```bash
curl https://cdn.tagless.foo/t/demo.js   # a full container: runtime + GA4 + Meta, ~2.5KB gz
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
| `packages/edge` | The hybrid target: a **user-owned gateway** (deployed to *your* Cloudflare account, free tier) that receives one first-party event stream and fans out to the documented vendor server APIs — Meta CAPI (with pixel dedup via `eid`), GA4 Measurement Protocol (same user/session as client hits), TikTok Events API, PostHog, Mixpanel. `placement: server\|both` per destination; `apply` emits the ready-to-deploy worker. The gateway's [envelope contract](docs/envelope.md) is public: **any backend can emit** — including your conversational app or agent, no browser involved. |
| `specs/` | Vendor spec contracts + fixtures: GA4, Meta, Google Ads, TikTok, LinkedIn, Hotjar, PostHog, Mixpanel. GTM-parity identity included — `_ga`-compatible client id + sessions, `_fbp`/`_fbc`, advanced matching via hashed `setUser()`, conversion linker, ecommerce `items[]`. Plus [`specs/events/conversational.yaml`](specs/events/conversational.yaml): the shared event vocabulary for chat/agent products. |
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

## Maintainership — read this before adopting

tagless is open source **by deliberate choice, not by default**. I built it to prove a shape: a tag manager operated by agents can be tiny, honest, and contract-driven. I am not going to be its sustained maintainer — and I'd rather say that in the README than let you discover it in a stale issue tracker.

If this idea earns a community that improves it, nothing would make me happier. The project is deliberately structured so you don't need me:

- **The design is the doc** — [SPEC.md](SPEC.md) states the thesis, the boundaries, and what core must never become.
- **The CI is the contract** — `npm test` covers every capability; a change that keeps it green is a change I'd merge.
- **The registry is the growth path** — new vendors are YAML specs + fixtures ([specs/](specs/)), no core changes needed.
- **Apache-2.0 means you never need permission** — extend it, fork it, or take it over entirely.

PRs are welcome and I'll review them when I can, honestly and without SLA. Vendor specs are the easiest contribution and the most valuable one. See [CONTRIBUTING.md](CONTRIBUTING.md).

There's no SLA, but there is a tip jar: if tagless saved your site half a megabyte, you can [buy the project a coffee](https://buy.stripe.com/6oUaEW8kf9mn0UY62SdjO00) — or a few.

## License

[Apache-2.0](LICENSE)
