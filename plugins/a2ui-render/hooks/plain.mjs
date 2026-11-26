// plain — an A2UI surface as plain Markdown, for apps that can't draw controls
// (the Claude mobile apps) and for the fallback text Claude writes next to a block.

import { resolveValue, pointerGet, joinPath } from './a2ui-core.mjs'

export function surfaceToMarkdown(surface, data = surface.data) {
  const out = []
  const actions = []
  const seen = new Set()
  const v = (x, scope) => { const r = resolveValue(x, data, scope); return r == null ? '' : typeof r === 'object' ? JSON.stringify(r) : String(r) }
  const ids = (c) => (Array.isArray(c.children) ? c.children : c.children && typeof c.children === 'object' ? [c.children.template ?? c.children] : c.child ? [c.child] : [])

  const walk = (cid, scope, depth) => {
    const c = surface.components.get(cid)
    if (!c || depth > 30) return
    const each = () => {
      for (const ch of ids(c)) {
        if (typeof ch === 'string') walk(ch, scope, depth + 1)
        else if (ch && ch.componentId && ch.path) {
          const base = joinPath(scope, ch.path)
          const items = pointerGet(data, base)
          if (Array.isArray(items)) items.forEach((_, j) => walk(ch.componentId, base + '/' + j, depth + 1))
        }
      }
    }
    switch (c.type) {
      case 'Text': {
        const t = v(c.text, scope)
        const level = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 4 }[c.variant ?? c.usageHint]
        if (t) out.push(level ? '#'.repeat(Math.min(4, level + 1)) + ' ' + t : c.variant === 'caption' ? `*${t}*` : t)
        return
      }
      case 'Row': {
        // Short rows (labels, badges) read best on one line.
        const parts = ids(c).filter((x) => typeof x === 'string').map((x) => inline(x, scope)).filter(Boolean)
        if (parts.length && parts.every((p) => p.length < 60)) { out.push(parts.join(' · ')); actions.push(...collectButtons(c, scope)); return }
        return each()
      }
      case 'Divider': out.push('---'); return
      case 'Badge': out.push(`**[${v(c.text ?? c.label, scope)}]**`); return
      case 'Callout': out.push(`> **${v(c.title, scope) || (c.tone ?? 'Note')}** ${v(c.text, scope)}`.trim()); return
      case 'KeyValue': {
        const items = resolveValue(c.items, data, scope)
        if (Array.isArray(items)) for (const it of items) out.push(`- ${it.label}: **${it.value}**`)
        return
      }
      case 'Stat': out.push(`- ${v(c.label, scope)}: **${v(c.value, scope)}**${c.delta ? ` (${v(c.delta, scope)})` : ''}`); return
      case 'Progress': {
        const val = Number(v(c.value, scope)) || 0
        const max = Number(v(c.max, scope)) || (val > 1 ? 100 : 1)
        out.push(`- ${v(c.label, scope)}: ${v(c.valueText, scope) || Math.round((val / max) * 100) + '%'}`)
        return
      }
      case 'BarChart': {
        const items = resolveValue(c.items, data, scope)
        if (c.title) out.push(`**${v(c.title, scope)}**`)
        if (Array.isArray(items)) for (const it of items) out.push(`- ${it.label}: ${it.value}`)
        return
      }
      case 'Avatar': out.push(`- ${v(c.name, scope)}${c.subtitle ? ` (${v(c.subtitle, scope)})` : ''}`); return
      case 'TextField':
      case 'DateTimeInput': out.push(`- ${v(c.label, scope) || 'Value'}: ${v(c.value, scope) || '—'}`); return
      case 'CheckBox': out.push(`- ${resolveValue(c.value, data, scope) === true ? '☑' : '☐'} ${v(c.label, scope)}`); return
      case 'ChoicePicker':
      case 'MultipleChoice': {
        const cur = v(c.value, scope)
        const opt = (c.options ?? []).find((o) => String(resolveValue(o.value, data, scope)) === cur)
        out.push(`- ${v(c.label, scope)}: ${opt ? v(opt.label, scope) : cur || '—'}`)
        return
      }
      case 'Slider': out.push(`- ${v(c.label, scope) || 'Value'}: ${v(c.value, scope)}`); return
      case 'Button': actions.push(buttonLabel(c, scope)); return
      case 'Image': out.push(`[${v(c.description, scope) || 'Image'}](${v(c.url, scope)})`); return
      case 'Tabs': {
        for (const t of c.tabs ?? []) { out.push(`**${v(t.title, scope)}**`); if (t.child) walk(t.child, scope, depth + 1) }
        return
      }
      case 'Carousel':
      case 'CardStack':
      case 'SwipeDeck': {
        let n = 0
        for (const ch of ids(c)) {
          if (typeof ch === 'string') { out.push(`**${++n}.**`); walk(ch, scope, depth + 1); continue }
          const base = joinPath(scope, ch.path)
          const items = pointerGet(data, base)
          if (Array.isArray(items)) items.forEach((_, j) => { out.push(`**${++n}.**`); walk(ch.componentId, base + '/' + j, depth + 1) })
        }
        for (const ch of c.choices ?? []) actions.push(`${v(ch.label, scope)} <card number>`)
        if (c.action) actions.push(v(c.actionLabel, scope) || 'Done')
        return
      }
      default: return each()
    }
  }
  const inline = (cid, scope) => {
    const c = surface.components.get(cid)
    if (!c) return ''
    if (c.type === 'Text') return c.variant && /^h/.test(c.variant) ? `**${v(c.text, scope)}**` : v(c.text, scope)
    if (c.type === 'Badge') return `**[${v(c.text ?? c.label, scope)}]**`
    if (c.type === 'Button') return ''
    return ''
  }
  const buttonLabel = (c, scope) => {
    if (seen.has(c.id + scope)) return ''
    seen.add(c.id + scope)
    const child = c.child && surface.components.get(c.child)
    return child && child.type === 'Text' ? v(child.text, scope) : v(c.label, scope) || c.id
  }
  const collectButtons = (row, scope) => ids(row).filter((x) => typeof x === 'string')
    .map((x) => surface.components.get(x)).filter((x) => x && x.type === 'Button').map((b) => buttonLabel(b, scope))

  walk(surface.root, '', 0)
  const acts = actions.filter(Boolean)
  if (acts.length) out.push('', `*Reply with: ${acts.map((a) => `“${a}”`).join(', ')}*`)
  return out.join('\n\n').replace(/\n{3,}/g, '\n\n').trim()
}
