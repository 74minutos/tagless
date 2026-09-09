/**
 * find_element: the mechanical half of "track clicks on that thing on the
 * page". The agent turns a marketer's fuzzy words into a description; this
 * turns the description into a verified CSS selector on the real page.
 * Pure function over HTML — testable without network.
 */
import { parseHTML } from 'linkedom'

const CLICKABLE = 'a, button, [role="button"], input[type="submit"], input[type="button"], [onclick], summary, label'

const textOf = (el) =>
  [
    el.textContent ?? '',
    el.getAttribute?.('aria-label') ?? '',
    el.getAttribute?.('title') ?? '',
    el.getAttribute?.('value') ?? '',
  ]
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()

function buildSelector(el, document) {
  const count = (sel) => {
    try {
      return document.querySelectorAll(sel).length
    } catch {
      return 0
    }
  }
  const tag = el.tagName.toLowerCase()
  // [class~="…"] attribute syntax survives Tailwind's dots and slashes,
  // where .class syntax would need escaping
  const classes = (el.getAttribute('class') ?? '').trim().split(/\s+/).filter(Boolean)
  const tries = []
  if (el.id) tries.push(`#${el.id}`)
  for (const attr of el.attributes ?? []) {
    if (attr.name.startsWith('data-') && attr.value) tries.push(`${tag}[${attr.name}="${attr.value}"]`)
  }
  // semantic before cosmetic: an href outlives a Tailwind class list
  if (tag === 'a' && el.getAttribute('href')) tries.push(`a[href="${el.getAttribute('href')}"]`)
  for (const c of classes) tries.push(`${tag}[class~="${c}"]`)
  if (classes.length) tries.push(tag + classes.map((c) => `[class~="${c}"]`).join(''))
  let up = el.parentElement
  while (up) {
    if (up.id) {
      tries.push(`#${up.id} ${tag}`)
      break
    }
    up = up.parentElement
  }
  // prefer a unique selector; otherwise the tightest multi-match one —
  // repeated CTAs matching together is usually exactly what's wanted
  let fallback = null
  for (const sel of tries) {
    const n = count(sel)
    if (n === 1) return { selector: sel, matches: 1 }
    if (n > 1 && (!fallback || n < fallback.matches)) fallback = { selector: sel, matches: n }
  }
  return fallback ?? { selector: null, matches: 0 }
}

export function findElement(html, description) {
  const { document } = parseHTML(html)
  const tokens = description
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 2)

  const scored = []
  for (const el of document.querySelectorAll(CLICKABLE)) {
    const text = textOf(el).toLowerCase()
    if (!text) continue
    const matched = tokens.filter((t) => text.includes(t)).length
    if (!matched) continue
    scored.push({ el, matched, brevity: 1 / (1 + text.length / 80) })
  }
  scored.sort((a, b) => b.matched - a.matched || b.brevity - a.brevity)

  return scored.slice(0, 5).map(({ el, matched }) => {
    const { selector, matches } = buildSelector(el, document)
    return {
      selector,
      matches,
      unique: matches === 1,
      matched_tokens: `${matched}/${tokens.length}`,
      tag: el.tagName.toLowerCase(),
      text: textOf(el).slice(0, 120),
      html: String(el.outerHTML ?? '').replace(/\s+/g, ' ').slice(0, 200),
    }
  })
}
