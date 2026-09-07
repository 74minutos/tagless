# tagless — Spec (draft v0.1, 2026-09)

> A tag manager built for agents.
>
> **The claim:** your entire tag manager ships less JavaScript than one Meta pixel. GTM's snippet is ~90KB+ before a single tag; `fbevents.js` alone is ~110KB. The tagless runtime targets **<3KB gzipped**, growing only with the integrations you actually use.

## 01 · Thesis — the manager is a compiler, not an app

90% of GTM's complexity exists so non-technical humans can configure tags through a UI: the template sandbox, the visual editor, the workspace model, the 100KB interpreted runtime shipped to every visitor. When the operator is an agent, that entire layer is dead weight.

What remains is small: an event bus, a consent gate, and code that emits network requests. So the product is three things:

- **A config format** — declarative tracking config in git, the single source of truth.
- **A compiler** — config in, minimal tree-shaken bundle out. No interpreter, no unused code, ever.
- **An MCP server** — the primary (and only) management interface. `plan` → approve → `apply`, Terraform-style.

## 02 · Experience — connect your agent, get tracking

The user never learns tagless. Their agent does — through MCP, which both Claude and ChatGPT speak natively.

1. **User → agent:** "Add GA4 and the Meta pixel to mysite.com. Purchases matter most."
2. **Agent · `init_site`:** inspects the site (or repo): detects the stack, existing tags, an existing GTM container, the consent banner. Drafts `tracking.config.yaml`.
3. **Agent · `plan`:** returns a human-readable diff: which events fire, the exact network requests each vendor receives, consent gating, and the bundle size delta ("+1.2KB").
4. **User approves · `apply`:** compiles and ships. **Repo mode:** opens a PR with the bundle and snippet. **Hosted mode:** publishes the bundle to the CDN — the one-line snippet on the site never changes, exactly like GTM's install story.
5. **Agent · `simulate` + `audit`:** feeds a synthetic `purchase` through the compiled bundle and shows the outgoing payloads. Later, `audit` crawls the live site and reports drift between config and reality.

Hosted mode is what makes "connect and it installs things on your web" true for people without a deploy pipeline: paste one immutable snippet once, and every change after that is the agent republishing bundles.

### Hosted mode is core, not a tier

**Decision (2026-09-07):** hosted is the default install path, not an optional convenience. GTM won on install UX — one paste, done, by anyone, on any CMS — and tagless matches that or loses the audience that gives an OSS project critical mass. Repo mode is the power-user path.

The snippet contract is frozen now (v0), even though the CDN ships in v1, because it's the one piece that can never change once it's pasted into pages we don't control:

```html
<script src="https://cdn.tagless.sh/t/<site-id>.js" defer></script>
```

- **The snippet URL is immutable; the bundle behind it is not.** `apply` republishes content at the same URL. Cache: short TTL + `stale-while-revalidate`, so updates land in minutes without the URL ever changing. (Consequence: no SRI on the alias URL — integrity-pinned installs use the versioned URL below instead.)
- **Every apply also publishes an immutable versioned URL** (`…/t/<site-id>@<plan_id>.js`, cached forever). `rollback` = repointing the alias to a previous version — no rebuild, instant.
- `<site-id>` is claimed at `init_site` time and namespaced per account; the alias only ever serves bundles applied with that account's key.

## 03 · Config — one file, in git

```yaml
# tracking.config.yaml — the whole container
site:
  id: mysite
  consent:
    source: onetrust          # or cookiebot | custom | none
    default: denied

events:
  page_view:  { auto: spa }
  purchase:
    source: dataLayer          # or dom selector | js api
    fields: { value: number, currency: string, items: list }

destinations:
  ga4:
    spec: ga4@1
    measurement_id: G-XXXXXXX
    events: [page_view, purchase]
  meta:
    spec: meta@2
    pixel_id: "1234567890"
    mode: direct               # fire the request, skip fbevents.js
    consent: marketing

targets:
  - client                     # default: pure-browser bundle, zero infra
  # - edge: cloudflare         # optional: fan-out moves server-side
```

The same config compiles to every target. **Client-only is the default** — no server required, because most of the world doesn't have one. Adding an edge/server target moves vendor fan-out off the browser without touching the site: Meta upgrades from direct pixel to CAPI automatically, because the vendor spec declares both placements.

## 04 · Interface — the MCP surface

| Tool | What it does |
|---|---|
| `init_site` | Inspect a URL or repo; detect stack, existing tags, consent; draft a config. |
| `import_gtm` | GTM container export JSON → config draft + report of what maps cleanly and what doesn't. The migration on-ramp. |
| `plan` | Config diff → exact changes: events, per-vendor request payloads, consent gates, size delta. Nothing ships without one. |
| `apply` | Compile and publish (PR in repo mode, CDN in hosted mode). Requires a plan ID. |
| `simulate` | Synthetic event in → outgoing requests out, full payloads. Runs in CI against fixtures. |
| `audit` | Crawl the live site; diff actually-fired requests against config. Drift detection. |
| `search_specs` | Query the vendor spec registry (endpoint contracts, placements, consent requirements). |
| `rollback` | Repoint hosted bundle / revert PR to any previous applied version. |

`plan`/`apply` with mandatory human approval is the governance model — it replaces GTM's workspace/version/publish ceremony with one reviewable diff.

## 05 · Ecosystem — vendor specs, not templates

GTM's moat is its template gallery. tagless doesn't replicate it — the agent writes integration code on the fly. What the community contributes instead are **contracts**:

- **The spec** — YAML: endpoint, required fields, PII hashing rules, consent requirements, allowed placements (client / server / both), modes (direct / sdk).
- **The fixtures** — input event → expected request pairs. CI validates any generated integration against them.
- **The guarantee** — "the agent wrote it" stops being a risk: code is disposable and regenerable, the contract is what's versioned and reviewed.

Contributing a spec is writing YAML from a vendor's public docs — a far lower bar than authoring a sandboxed GTM template. That's where global feedback compounds.

## 06 · Boundaries — what core will never be

- **No visual editor.** The interface is MCP + git. A read-only status page at most.
- **No template sandbox / custom JS tags.** Arbitrary vendor code is the disease. Integrations are compiled from specs.
- **No analytics product.** tagless routes events; it never stores or charts them.
- **No CDP ambitions.** No identity resolution, no audiences, no warehouse sync. Route and get out of the way.
- **No consent management.** It consumes CMP state as a first-class input; it doesn't render banners.

Everything else — new vendors, new event sources, new targets — lives in the spec registry, not in core. Core stays: compiler + runtime + MCP + simulator.

## 07 · Roadmap

| Stage | Scope | Proof |
|---|---|---|
| **v0** | Runtime core + compiler (client target) + local MCP (`plan`/`apply`/`simulate`) + 3 specs: GA4, Meta, TikTok + `import_gtm`. | One real site fully migrated off GTM; Lighthouse before/after published. |
| **v1** | Hosted loader (CDN + immutable snippet — **committed core, contract frozen in v0**, see §02), edge target (Cloudflare Workers one-click), `audit`, remote MCP endpoint. | "Connect Claude → tracking installed" demo video, end to end, no terminal. |
| **v2** | Public spec registry + contribution CI, `rollback`, consent-mode interop, 15+ specs. | First external spec contribution merged. |

## 08 · Open questions

1. **Name availability.** ~~"tagless" is the name — verify npm package, tagless.dev domain, and GitHub org.~~ **Resolved 2026-09-03:** bare handles squatted (dormant). Brand stays **tagless**; GitHub org **tagless-dev**, domain **tagless.sh**, npm scope **@tagless-dev** (main CLI package `taglessjs` unscoped). All verified free.
2. **License.** ~~MIT vs Apache-2.0.~~ **Resolved: Apache-2.0** (patent grant; hosted offering plausible).
3. **Hosted-mode economics.** Who pays for the CDN? Free tier on Cloudflare R2/Workers is likely enough for years, but it's the one piece with an ongoing bill and an implicit SLA.
4. **Verification mechanics.** `simulate` is deterministic (compiled bundle + jsdom), but `audit` against live sites needs a headless-browser service or a local runner — decide which ships first.
5. **SPA event capture surface.** How much auto-capture (route changes, clicks, forms) goes in core vs. stays declared-only. Every auto-capture feature is bytes; the budget is 3KB.
