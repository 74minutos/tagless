/**
 * tagless measured by tagless: the snippet + a two-button consent bar,
 * injected into the landing and the guide. Deliberately visible machinery —
 * open the network tab, hit Allow, and watch the queued events release:
 * the page is its own demo. Config: site/tracking.config.yaml.
 */
export const DOGFOOD = `
<style>
  #tlc { position: fixed; left: 0; right: 0; bottom: 0; background: #f3ecdf; color: #40382c;
    font: 14px/1.5 ui-sans-serif, system-ui, sans-serif; padding: 12px 24px;
    display: flex; gap: 14px; align-items: center; justify-content: center; flex-wrap: wrap;
    border-top: 1px solid #d9c9ae; }
  #tlc button { font: 600 13px ui-sans-serif, system-ui, sans-serif; padding: 6px 14px;
    border-radius: 999px; border: 1px solid #40382c; cursor: pointer; background: #40382c; color: #f3ecdf; }
  #tlc button.no { background: transparent; color: #40382c; }
</style>
<div id="tlc" hidden>
  <span>This page measures itself with tagless — a consent-gated container, like everything it ships.</span>
  <button onclick="tlDecide(true)">Allow analytics</button>
  <button class="no" onclick="tlDecide(false)">Decline</button>
</div>
<script src="https://cdn.tagless.foo/t/tagless.js" defer></script>
<script>
(function () {
  var K = 'tl_consent', v = null
  try { v = localStorage.getItem(K) } catch (e) {}
  function apply(granted) {
    var tries = 0
    var i = setInterval(function () {
      if (window.tagless) { clearInterval(i); window.tagless.setConsent({ analytics: granted }) }
      else if (++tries > 25) clearInterval(i)
    }, 200)
  }
  if (v !== null) apply(v === '1')
  else document.getElementById('tlc').hidden = false
  window.tlDecide = function (granted) {
    try { localStorage.setItem(K, granted ? '1' : '0') } catch (e) {}
    document.getElementById('tlc').hidden = true
    apply(granted)
  }
})()
</script>`
