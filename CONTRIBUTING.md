# Contributing to tagless

First, read [Maintainership](README.md#maintainership--read-this-before-adopting) in the README: this project is deliberately community-shaped. Contributions aren't a favor to a maintainer — they're how the project is meant to grow.

## The contribution that matters most: vendor specs

A new vendor = one directory in [`specs/`](specs/):

1. `spec.yaml` — the contract, written from the vendor's **public docs**: endpoints, placements (`client`/`server`), modes (`direct`/`sdk`/…), consent category, config fields, PII hashing rules, event-name map. Flag anything reverse-engineered as `status: experimental` (see `specs/tiktok/spec.yaml` for the honest way to do it).
2. `fixtures/*.json` — input event → expected request pairs. `npm test` compiles a container with your destination, runs it in the sandbox, and asserts the requests (query `params` subset and/or JSON `body` deep subset).

If the vendor needs a generator, add it in `packages/compiler/src/vendors/` mirroring `meta.js`. Generators are small on purpose: no SDKs, emit the request directly.

## Everything else

- **Bug fixes**: a failing check in `scripts/` reproducing the bug is worth more than the fix itself.
- **Core changes**: read SPEC.md §06 (non-goals) first. Core stays: runtime + compiler + MCP + simulator + cdn-worker. PRs that grow core where the registry could grow instead will be redirected to the registry.
- **The runtime has a byte budget**: <3KB gzip for a compiled container. `npm run size` is the judge.

## Ground rules

- `npm test` green — the CI is the contract.
- No new runtime dependencies without a very good reason (the browser runtime has zero).
- Reviews happen honestly and without an SLA. If your fork moves faster than my reviews, fork proudly — Apache-2.0 exists for that.
