# Vendor specs

tagless has no template gallery. Integrations are **generated** (by an agent or a built-in reference generator) and **validated** against these contracts.

Each vendor directory contains:

- `spec.yaml` — the contract: endpoints, placements (`client` / `server`), modes (`direct` / `sdk` / `capi`), required fields, event-name mapping, consent category, PII hashing rules.
- `fixtures/*.json` — input event → expected request pairs. CI runs every generated integration against every fixture; a generator that doesn't reproduce the expected request doesn't ship.

Contributing a new vendor = writing these two things from the vendor's public docs. No sandboxed template code, no review of imperative JS — the contract is what's reviewed and versioned; generated code is disposable.

## Fixture shape

```json
{
  "config": { "<vendor config used for this fixture>": "..." },
  "event": { "name": "purchase", "data": { "value": 49.9, "currency": "EUR" } },
  "expect": [
    {
      "url": "https://vendor.example/collect",
      "method": "GET",
      "params": { "ev": "Purchase", "cd[value]": "49.9" }
    }
  ]
}
```

`params` are asserted as a subset — extra params (timestamps, cache busters) are allowed unless listed in `forbid`.
