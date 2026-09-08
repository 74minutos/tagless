# @tagless-dev/cdn-worker

The hosted loader (SPEC §02): a Cloudflare Worker + KV serving compiled bundles at `cdn.tagless.foo`.

- `GET /t/<site>.js` — the immutable snippet URL; serves the current bundle (`max-age=300` + `stale-while-revalidate=86400`, `x-tagless-version` header).
- `GET /t/<site>@<version>.js` — versioned bundle, `immutable`, cached forever.
- `PUT /t/<site>@<version>.js` / `POST /t/<site>` — publish API (Bearer `PUBLISH_KEY`); used by the MCP `publish_hosted` and `rollback` tools. An alias can only point at an already-uploaded version.

## Deploy (once)

```bash
cd packages/cdn-worker
npx wrangler login                             # Cloudflare account with the tagless.foo zone
npx wrangler kv namespace create BUNDLES       # paste the id into wrangler.toml
openssl rand -hex 32 | npx wrangler secret put PUBLISH_KEY
npx wrangler deploy
```

Then export for the MCP server:

```bash
export TAGLESS_PUBLISH_KEY=<the same key>
# optional: export TAGLESS_CDN=https://cdn.tagless.foo (default)
```

Storage layout in KV: `bundle:<site>@<version>` → JS, `alias:<site>` → version.
