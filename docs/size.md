# The 1% claim, measured

**Claim:** a tagless container runs your tag stack at ~1% of its GTM-world JavaScript weight.

Measured 2026-09-09 against the production container of the first migrated site (7 destinations: GA4, Google Ads, Meta, TikTok, LinkedIn, Hotjar, plus a first-party collector — `examples` of every wire format live in [`specs/`](../specs/)).

| JavaScript shipped to the browser | raw | gzip |
|---|--:|--:|
| `gtag.js` (GA4 + Google Ads) | 427,848 B | 148,643 B |
| `fbevents.js` (Meta) | 415,673 B | 107,957 B |
| `insight.min.js` (LinkedIn) | 56,861 B | 20,652 B |
| `events.js` (TikTok — loader only¹) | 7,878 B | 1,869 B |
| **Vendor SDKs, total²** | **908,260 B** | **279,121 B** |
| **tagless container, same stack** | **9,950 B** | **4,185 B** |
| **ratio** | **1.1%** | **1.5%** |

¹ TikTok's `events.js` is only the loader — its full per-pixel SDK loads on top of it. Counted at loader size to stay conservative.
² Excludes `gtm.js` itself (typically 50–300KB more, container-dependent) and Hotjar's SDK (which loads identically in both worlds — recordings/heatmaps *are* the script). Both exclusions favor GTM.

The lean container (GA4 + Meta only, the live [`/t/demo.js`](https://cdn.tagless.foo/t/demo.js)) is **2,465 B gzip** — the runtime's own budget is <3KB and CI fails the build over it (`npm run size`).

## Reproduce it

```bash
for u in \
  "https://www.googletagmanager.com/gtag/js?id=G-XXXXXXX" \
  "https://connect.facebook.net/en_US/fbevents.js" \
  "https://snap.licdn.com/li.lms-analytics/insight.min.js" \
  "https://analytics.tiktok.com/i18n/pixel/events.js"; do
  curl -sL -o sdk.js "$u"
  echo "$(wc -c < sdk.js) raw / $(gzip -9 -c sdk.js | wc -c) gz  <- $u"
done
curl -s https://cdn.tagless.foo/t/demo.js | wc -c
```

Sizes drift as vendors ship; re-run and update this table rather than trusting it blindly. That's the point of the claim being a measurement.
