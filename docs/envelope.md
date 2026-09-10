# The envelope: tagless's server-side event API

The gateway (`packages/edge`) accepts events from **anything**, not just the
browser relay. A conversational app, an agent backend, a cron job — if it can
`POST` JSON, it can route events through your gateway to every configured
destination, with consent gating and no vendor SDKs.

## The contract

`POST <your-gateway>/e` — `sendBeacon`-compatible (a JSON body, no required
content-type header):

```json
{
  "event":   { "name": "message_sent", "data": { "turn": 3, "latency_ms": 900 }, "ts": 1789000000000 },
  "eid":     "1789000000000-message_sent",
  "consent": { "analytics": true, "marketing": false },

  "ids":     { "distinct_id": "user-42" },
  "user":    { "em": "<sha256 of normalized email>" },
  "page":    { "url": "https://app.example.com/chat", "ref": "", "title": "Chat" }
}
```

| Field | Required | Notes |
|---|---|---|
| `event.name` / `event.data` / `event.ts` | ✔ | `data` values: scalars, plus `items[]` for ecommerce |
| `eid` | ✔ | idempotency/dedup id — vendors that dedup (Meta CAPI) use it |
| `consent` | ✔ | the gateway drops each destination whose category isn't `true`. No consent, no fan-out — there is no bypass. |
| `ids` | – | browser relays send `fbp`/`fbc`/`cid`/`sid`; server sources typically send `distinct_id` (product-analytics identity) |
| `user` | – | **pre-hashed** (SHA-256, lowercase hex). Plaintext PII in this field is a bug in your caller, not a feature of the gateway. |
| `page` | – | for conversational surfaces, the app screen or channel |

The gateway adds what only it can see: client IP and user agent from the
request headers.

## From a Python agent backend

```python
import requests, time

def track(name, data, consent, distinct_id):
    requests.post("https://t.example.com/e", json={
        "event": {"name": name, "data": data, "ts": int(time.time() * 1000)},
        "eid": f"{int(time.time() * 1000)}-{name}",
        "ids": {"distinct_id": distinct_id},
        "consent": consent,
    }, timeout=3)

track("tool_called", {"tool": "search", "success": True, "latency_ms": 412},
      {"analytics": True}, "user-42")
```

## Conversational events

Use the shared vocabulary in
[`specs/events/conversational.yaml`](../specs/events/conversational.yaml) so
your events mean the same thing everywhere. Its one hard rule: **message
content never travels** — send properties *about* the message (turn, role,
model, tokens, latency), never the message. In a medium where users type PII
freely, that's a structural guarantee, not a guideline.
