# @tagless-dev/mcp (stub)

The MCP server is the only management interface for tagless. Not implemented yet — the surface is specified in [SPEC.md §04](../../SPEC.md):

`init_site` · `import_gtm` · `plan` · `apply` · `simulate` · `audit` · `search_specs` · `rollback`

Implementation notes:

- Built on `@modelcontextprotocol/sdk`; runs locally over stdio first (`npx @tagless-dev/mcp`), remote endpoint in v1.
- `plan` output must include: events fired, exact per-vendor request payloads (from `simulate`), consent gating, and the gzip size delta of the compiled bundle.
- `apply` refuses to run without a plan ID produced from the current config hash.
- `simulate` = compile → run the bundle in a DOM sandbox → intercept `fetch`/`sendBeacon` → return the captured requests. The same harness runs spec fixtures in CI.
