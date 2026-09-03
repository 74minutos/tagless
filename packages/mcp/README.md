# @tagless-dev/mcp

The tagless MCP server — the only management interface. Runs over stdio:

```json
{ "mcpServers": { "tagless": { "command": "node", "args": ["packages/mcp/src/index.js"] } } }
```

## Tools (implemented)

| Tool | Contract |
|---|---|
| `plan` | Config in → destinations, consent gates, events, gzip size vs the 3KB budget, delta vs the current bundle, and a `plan_id`. Writes nothing. |
| `apply` | Requires the `plan_id` of the **exact current config** — any config change invalidates the plan and apply refuses with the new id to review. Compiles to `<config dir>/dist`. |
| `simulate` | Compiles, runs the bundle in the vm sandbox (`@tagless-dev/simulator`), fires the given events under a given consent state, returns every outgoing request with parsed params. |
| `search_specs` | Queries `specs/`: id, placements, modes, consent category, config fields, fixture count. |

## Still to build (SPEC.md §04)

`init_site` · `import_gtm` · `audit` · `rollback` · remote endpoint (v1)

## Verification

- `npm test` — every spec fixture compiled, sandboxed, and asserted (subset match on params).
- `npm run mcp:smoke` — real stdio client: list → plan → simulate → stale-apply rejected → apply.
