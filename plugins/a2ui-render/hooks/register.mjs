// a2ui-render — render A2UI surfaces as native Claude Code UI.
//
// When Claude's reply contains a fenced block
//
//   ```a2ui
//   {"version":"1.0","createSurface":{...}}
//   {"version":"1.0","updateComponents":{...}}
//   ```
//
// this mod redraws the message: the Markdown around the block stays as it is, and the
// block becomes real controls. Pressing a button that carries an A2UI `event` action
// sends the action, with the surface's current data model, back to Claude.
//
// Works in the Code tab of the Claude Desktop app and in the terminal. Claude and the
// transcript keep the raw JSON; only the drawing changes.

import { parseA2UI, buildSurfaces, splitSegments, resolveValue, pointerGet, pointerSet, joinPath } from './a2ui-core.mjs'
import { resolveTheme, initialsOf } from './themes.mjs'

const FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*a2ui[ \t\r]*$/im
const MAX_MARKDOWN = 10000

// Per-surface live state, keyed by `${messageId}:${surfaceId}`.
const live = new Map()

export function register(on, options = {}) {
  const sendMode = String(options.send_as ?? 'mod')
  const settings = { theme: String(options.theme ?? 'clean'), accent: String(options.accent ?? 'orange') }

  on('ui.render', { component: 'AssistantMessage', props: { text: FENCE } }, async ($, e, next) => {
    try {
      const text = String(e.props?.text ?? '')
      if (!splitSegments(text).some((s) => s.kind === 'a2ui')) return next(e)
      // The mods API may only be called directly ($.ns.method(...)), so hand the
      // renderer small callbacks instead of $ itself.
      const els = $.ui.resolve(e)
      const io = {
        redraw: () => $.ui.invalidate('ui.render'),
        submit: (text) => (sendMode === 'user' ? $.prompt.submit({ text, asUser: true }) : $.prompt.submit({ text })),
      }
      const tree = renderMessage(e, els, io, settings)
      return tree ?? next(e)
    } catch (err) {
      // Never break the transcript: fall back to Claude Code's own drawing.
      return next(e)
    }
  })
}

// ---------------------------------------------------------------------------

function renderMessage(e, els, io, settings) {
  const text = String(e.props?.text ?? '')
  const segments = splitSegments(text)
  if (!segments.some((s) => s.kind === 'a2ui')) return undefined

  const { Box, Text, Markdown, Code } = els
  const surfaceKind = e.surface === 'terminal' ? 'terminal' : 'desktop'
  const columns = Math.max(30, Math.min(120, (e.viewport?.columns ?? 80) - 4))
  const msgId = String(e.requestId ?? 'msg')

  const children = []
  segments.forEach((seg, i) => {
    if (seg.kind === 'md') {
      const md = seg.text.trim()
      if (!md) return
      children.push(md.length <= MAX_MARKDOWN ? Markdown({ key: `md-${i}`, text: md }) : Text({ key: `md-${i}`, children: [md.slice(0, MAX_MARKDOWN)] }))
      return
    }
    if (!seg.closed) {
      children.push(Text({ key: `building-${i}`, dimColor: true, children: ['◆ Building UI…'] }))
      return
    }
    let surfaces
    try {
      surfaces = buildSurfaces(parseA2UI(seg.text))
    } catch (err) {
      children.push(Text({ key: `err-${i}`, bold: true, children: ['A2UI could not be read: ' + err.message] }))
      children.push(Code({ key: `code-${i}`, source: seg.text.slice(0, 9000), language: 'json' }))
      return
    }
    for (const s of surfaces) {
      const id = `${msgId}:${s.id}`
      if (!live.has(id)) live.set(id, { data: structuredClone(s.data), sent: null, tab: {} })
      const state = live.get(id)
      const theme = resolveTheme(s.theme, settings, surfaceKind)
      const ctx = { els, surface: s, state, id, columns, theme, redraw: io.redraw, submit: io.submit }
      children.push(renderSurface(ctx))
    }
  })

  return Box({ key: `a2ui-msg-${msgId}`, flexDirection: 'column', rowGap: 'sm', children })
}

function renderSurface(ctx) {
  const { els, surface, state, theme } = ctx
  const { Box, Text } = els
  const body = surface.components.has(surface.root)
    ? renderComponent(ctx, surface.root, '', ctx.columns)
    : Text({ key: `${ctx.id}:noroot`, dimColor: true, children: [`(surface ${surface.id} has no root component)`] })
  const footer = state.sent
    ? [Text({ key: `${ctx.id}:sent`, dimColor: true, size: 'footnote', children: [`✓ Sent “${state.sent}” to Claude`] })]
    : []
  return Box({ key: `surface-${ctx.id}`, flexDirection: 'column', rowGap: theme.rowGap, marginY: 'sm', children: [body, ...footer] })
}

// Render one component. `scope` is the data path that relative bindings resolve against
// (used inside list templates). `width` is a soft hint in columns. `inRow` tells cards
// and tiles to share the row's width.
function renderComponent(ctx, cid, scope, width, depth = 0, suffix = '', inRow = false) {
  const { els, surface, state, theme: T } = ctx
  const { Box, Text, Button, Input, Select, Link, Markdown, Svg } = els
  const c = surface.components.get(cid)
  const key = (k = '') => `${ctx.id}:${cid}${suffix}${k}`
  if (!c) return Text({ key: key(':missing'), dimColor: true, children: [`‹missing ${cid}›`] })
  if (depth > 40) return Text({ key: key(':deep'), dimColor: true, children: ['‹too deep›'] })

  const val = (v) => resolveValue(v, state.data, scope)
  const str = (v) => {
    const r = val(v)
    return r == null ? '' : typeof r === 'object' ? JSON.stringify(r) : String(r)
  }
  const num = (v, d = 0) => { const n = Number(val(v)); return Number.isFinite(n) ? n : d }
  const bindPath = (v) => (v && typeof v === 'object' && typeof (v.path ?? v['@path']) === 'string' ? joinPath(scope, v.path ?? v['@path']) : null)
  const rowShare = inRow ? { flexGrow: 1, flexShrink: 1, minWidth: 16 } : {}
  const kids = (w, asRow = false) => childIds(c).flatMap((ch, i) => {
    if (typeof ch === 'string') return [renderComponent(ctx, ch, scope, w, depth + 1, suffix, asRow)]
    const base = joinPath(scope, ch.path)
    const items = pointerGet(state.data, base)
    if (!Array.isArray(items)) return []
    return items.map((_, j) => renderComponent(ctx, ch.componentId, base + '/' + j, w, depth + 1, `${suffix}#${i}.${j}`, asRow))
  })
  // A field label, above the control in the soft theme.
  const withLabel = (label, control) => {
    if (!T.labelsAbove || !label) return control
    return Box({ key: key(':field'), flexDirection: 'column', rowGap: 'xs', children: [Text({ key: key(':label'), ...T.label(), children: [label] }), control] })
  }

  switch (c.type) {
    case 'Text': {
      const v = c.variant ?? c.usageHint
      const t = str(c.text)
      const level = { h1: 1, h2: 2, h3: 3, h4: 4, h5: 5 }[v]
      if (level) return Text({ key: key(), ...T.heading(level), children: [t] })
      if (v === 'caption') return Text({ key: key(), size: 'caption', dimColor: true, children: [t] })
      if (c.tone) return Text({ key: key(), color: T.tone(c.tone).key, children: [t] })
      return Text({ key: key(), children: [t] })
    }
    case 'Column':
    case 'List':
      return Box({ key: key(), flexDirection: 'column', rowGap: T.rowGap, ...rowShare, children: kids(width) })
    case 'Row': {
      const n = Math.max(1, childIds(c).length)
      const justify = { spaceBetween: 'space-between', center: 'center', end: 'flex-end', start: 'flex-start' }[c.distribution ?? c.justify] ?? 'flex-start'
      return Box({ key: key(), flexDirection: 'row', columnGap: 'md', rowGap: 'sm', alignItems: c.alignment === 'top' ? 'flex-start' : 'center', justifyContent: justify, flexWrap: 'wrap', ...rowShare, children: kids(Math.floor(width / n), true) })
    }
    case 'Card':
      return Box({ key: key(), flexDirection: 'column', rowGap: T.rowGap, ...T.card(), ...rowShare, ...(c.highlight ? { borderStyle: 'round', borderColor: T.accent.key } : {}), children: kids(width - 4) })
    case 'Divider':
      return Markdown({ key: key(), text: '---' })
    case 'Button': {
      const label = c.child ? plainText(ctx, c.child, scope) : str(c.label) || cid
      const primary = c.variant === 'primary' || c.primary === true
      return Button({ key: key(), label, ...(primary ? { variant: 'primary' } : {}), onPress: () => pressButton(ctx, c, scope) })
    }
    case 'TextField':
    case 'DateTimeInput': {
      const p = bindPath(c.value ?? c.text)
      const current = p ? pointerGet(state.data, p) : val(c.value ?? c.text)
      const label = str(c.label) || (c.type === 'DateTimeInput' ? 'Date' : '')
      const input = Input({
        key: key(),
        ...(T.labelsAbove ? {} : { label: label || ' ' }),
        placeholder: str(c.placeholder) || (c.type === 'DateTimeInput' ? 'YYYY-MM-DD' : ''),
        value: current == null ? '' : String(current),
        onInput: (v) => { if (p) pointerSet(state.data, p, v) },
        onSubmit: (v) => { if (p) pointerSet(state.data, p, v); ctx.redraw() },
      })
      return withLabel(label, input)
    }
    case 'CheckBox': {
      const p = bindPath(c.value)
      const isOn = (p ? pointerGet(state.data, p) : val(c.value)) === true
      return Button({
        key: key(),
        plain: true,
        label: `${isOn ? '☑' : '☐'}  ${str(c.label)}`,
        onPress: () => { if (p) { pointerSet(state.data, p, !isOn); ctx.redraw() } },
      })
    }
    case 'ChoicePicker':
    case 'MultipleChoice': {
      const p = bindPath(c.value ?? c.selections)
      const opts = (Array.isArray(c.options) ? c.options : [])
        .map((o) => ({ value: String(val(o.value) ?? ''), label: str(o.label) || String(val(o.value) ?? '') }))
        .filter((o, i, a) => o.value !== '' && a.findIndex((x) => x.value === o.value) === i)
      if (!opts.length) return Text({ key: key(), dimColor: true, children: ['(no options)'] })
      let cur = p ? pointerGet(state.data, p) : val(c.value)
      const multi = Array.isArray(cur)
      if (multi) cur = cur[0]
      const value = opts.some((o) => o.value === String(cur)) ? String(cur) : opts[0].value
      const label = str(c.label)
      const select = Select({
        key: key(),
        ...(T.labelsAbove ? {} : { label: label || ' ' }),
        options: opts,
        value,
        onSelect: (v) => { if (p) pointerSet(state.data, p, multi ? [v] : v); ctx.redraw() },
      })
      return withLabel(label, select)
    }
    case 'Slider': {
      const p = bindPath(c.value)
      const min = num(c.min ?? c.minValue, 0), max = num(c.max ?? c.maxValue, 100)
      const step = Math.max((max - min) / 20, num(c.step, 1) || 1)
      const opts = []
      for (let x = min; x <= max + 1e-9 && opts.length < 21; x += step) { const r = String(Math.round(x * 100) / 100); opts.push({ value: r, label: r }) }
      const cur = String(p ? pointerGet(state.data, p) ?? min : val(c.value) ?? min)
      const label = str(c.label) || 'Value'
      const select = Select({
        key: key(),
        ...(T.labelsAbove ? {} : { label }),
        options: opts,
        value: opts.some((o) => o.value === cur) ? cur : opts[0].value,
        onSelect: (v) => { if (p) pointerSet(state.data, p, Number(v)); ctx.redraw() },
      })
      return withLabel(label, select)
    }
    case 'Tabs': {
      const tabs = Array.isArray(c.tabs) ? c.tabs : (Array.isArray(c.tabItems) ? c.tabItems : [])
      if (!tabs.length) return Box({ key: key(), flexDirection: 'column', children: kids(width) })
      const active = Math.min(state.tab[cid] ?? 0, tabs.length - 1)
      const bar = Box({
        key: key(':bar'), flexDirection: 'row', columnGap: 'md',
        children: tabs.map((t, i) => Button({
          key: key(':tab' + i), plain: true, dimColor: i !== active,
          label: i === active ? `▍${str(t.title) || `Tab ${i + 1}`}` : (str(t.title) || `Tab ${i + 1}`),
          onPress: () => { state.tab[cid] = i; ctx.redraw() },
        })),
      })
      const childId = tabs[active].child ?? tabs[active].content
      return Box({ key: key(), flexDirection: 'column', rowGap: 'sm', ...rowShare, children: [bar, Markdown({ key: key(':rule'), text: '---' }), childId ? renderComponent(ctx, childId, scope, width, depth + 1, suffix) : Text({ key: key(':empty'), children: [''] })] })
    }
    case 'Modal': {
      const content = c.content ?? c.contentChild ?? c.child
      return Box({ key: key(), flexDirection: 'column', ...T.card(), children: content ? [renderComponent(ctx, content, scope, width - 4, depth + 1, suffix)] : [] })
    }
    case 'Image':
    case 'Video':
    case 'AudioPlayer': {
      const url = str(c.url)
      const label = `${c.type === 'Image' ? '🖼' : '▶'} ${str(c.description ?? c.altText) || c.type}`
      return url ? Link({ key: key(), href: url, label }) : Text({ key: key(), dimColor: true, children: [label] })
    }
    case 'Icon':
      return Text({ key: key(), dimColor: true, children: [`[${str(c.name)}]`] })

    // ---- a2ui-render extended catalog ----

    case 'Badge':
      return Box({ key: key(), flexDirection: 'row', children: [Text({ key: key(':t'), ...T.badge(c.tone ?? 'neutral'), children: [` ${str(c.text ?? c.label)} `] })] })

    case 'Callout': {
      const tn = T.tone(c.tone ?? 'info')
      const title = str(c.title)
      const body = str(c.text)
      return Box({
        key: key(), ...T.callout(c.tone ?? 'info'), ...rowShare,
        children: [
          Text({ key: key(':icon'), color: tn.key, bold: true, children: [tn.icon] }),
          Box({
            key: key(':body'), flexDirection: 'column', flexShrink: 1,
            children: [
              ...(title ? [Text({ key: key(':title'), bold: true, weight: 'semibold', children: [title] })] : []),
              ...(body ? [Text({ key: key(':text'), children: [body] })] : []),
              ...kids(width - 4),
            ],
          }),
        ],
      })
    }

    case 'KeyValue': {
      const items = Array.isArray(val(c.items)) ? val(c.items) : [{ label: c.label, value: c.value }]
      const labelWidth = Math.min(24, Math.max(8, ...items.map((it) => String(resolveValue(it.label, state.data, scope) ?? '').length + 2)))
      return Box({
        key: key(), flexDirection: 'column', rowGap: 'xs', ...rowShare,
        children: items.map((it, i) => Box({
          key: key(':kv' + i), flexDirection: 'row', columnGap: 'sm',
          children: [
            Box({ key: key(':kl' + i), minWidth: labelWidth, children: [Text({ key: key(':klt' + i), dimColor: true, children: [String(resolveValue(it.label, state.data, scope) ?? '')] })] }),
            Text({ key: key(':kv' + i + 'v'), weight: 'medium', children: [String(resolveValue(it.value, state.data, scope) ?? '')] }),
          ],
        })),
      })
    }

    case 'Stat': {
      const delta = str(c.delta)
      const up = /^\+|^▲/.test(delta) || c.trend === 'up'
      const down = /^-|^▼/.test(delta) || c.trend === 'down'
      const good = c.goodWhen === 'down' ? down : up
      const deltaTone = !delta ? null : (up || down) ? (good ? 'success' : 'error') : 'neutral'
      return Box({
        key: key(), ...T.tile(), ...rowShare,
        children: [
          Text({ key: key(':l'), size: 'footnote', dimColor: true, children: [str(c.label)] }),
          Text({ key: key(':v'), size: 'title', weight: 'semibold', bold: true, children: [str(c.value)] }),
          ...(delta ? [Text({ key: key(':d'), size: 'footnote', color: T.tone(deltaTone).key, children: [`${up ? '▲ ' : down ? '▼ ' : ''}${delta.replace(/^[▲▼]\s*/, '')}`] })] : []),
        ],
      })
    }

    case 'Progress': {
      let v = num(c.value, 0)
      const max = num(c.max, v > 1 ? 100 : 1)
      const f = max > 0 ? v / max : 0
      const pct = `${Math.round(f * 100)}%`
      const rgb = c.tone ? T.tone(c.tone).rgb : T.accent.rgb
      const bar = T.desktop
        ? Svg({ key: key(':bar'), source: T.barSvg(f, 320, 8, rgb), alt: `${str(c.label)} ${pct}`, width: 320, height: 8 })
        : Text({ key: key(':bar'), color: c.tone ? T.tone(c.tone).key : T.accent.key, children: [T.textBar(f, Math.max(10, Math.min(30, width - 10)))] })
      return Box({
        key: key(), flexDirection: 'column', rowGap: 'xs', ...rowShare,
        children: [
          Box({ key: key(':head'), flexDirection: 'row', columnGap: 'md', children: [Text({ key: key(':l'), children: [str(c.label)] }), Text({ key: key(':p'), dimColor: true, children: [str(c.valueText) || pct] })] }),
          bar,
        ],
      })
    }

    case 'BarChart': {
      const items = (Array.isArray(val(c.items)) ? val(c.items) : []).map((it) => ({ label: String(it.label ?? ''), value: Number(it.value) || 0 }))
      const max = Math.max(1, ...items.map((it) => it.value))
      const labelWidth = Math.min(20, Math.max(6, ...items.map((it) => it.label.length + 1)))
      const title = str(c.title)
      return Box({
        key: key(), flexDirection: 'column', rowGap: 'xs', ...rowShare,
        children: [
          ...(title ? [Text({ key: key(':title'), weight: 'semibold', bold: true, children: [title] })] : []),
          ...items.map((it, i) => Box({
            key: key(':row' + i), flexDirection: 'row', columnGap: 'sm', alignItems: 'center',
            children: [
              Box({ key: key(':lb' + i), minWidth: labelWidth, children: [Text({ key: key(':lt' + i), dimColor: true, children: [it.label] })] }),
              T.desktop
                ? Svg({ key: key(':b' + i), source: T.barSvg(it.value / max, 220, 10), alt: `${it.label}: ${it.value}`, width: 220, height: 10 })
                : Text({ key: key(':b' + i), color: T.accent.key, children: [T.textBar(it.value / max, Math.max(8, Math.min(30, width - labelWidth - 8)))] }),
              Text({ key: key(':v' + i), size: 'footnote', children: [String(it.value)] }),
            ],
          })),
        ],
      })
    }

    case 'Avatar': {
      const name = str(c.name)
      const ini = initialsOf(name)
      const pic = T.desktop
        ? Svg({ key: key(':pic'), source: T.avatarSvg(ini, 32), alt: name || 'avatar', width: 32, height: 32 })
        : Text({ key: key(':pic'), color: T.accent.key, bold: true, children: [`(${ini})`] })
      const sub = str(c.subtitle)
      return Box({
        key: key(), flexDirection: 'row', columnGap: 'sm', alignItems: 'center', ...rowShare,
        children: [pic, Box({ key: key(':txt'), flexDirection: 'column', children: [Text({ key: key(':n'), weight: 'medium', children: [name] }), ...(sub ? [Text({ key: key(':s'), size: 'footnote', dimColor: true, children: [sub] })] : [])] })],
      })
    }

    case 'Spacer':
      return Box({ key: key(), flexGrow: 1, minHeight: 1 })

    default:
      return Box({
        key: key(), flexDirection: 'column', ...rowShare,
        children: [Text({ key: key(':type'), dimColor: true, children: [`‹${c.type}›`] }), ...kids(width)],
      })
  }
}

function childIds(c) {
  if (Array.isArray(c.children)) return c.children
  if (c.children && typeof c.children === 'object') {
    if (Array.isArray(c.children.explicitList)) return c.children.explicitList // 0.8
    const t = c.children.template ?? c.children
    if (t.componentId && t.path) return [{ componentId: t.componentId, path: t.path }]
    if (t.componentId && t.dataBinding) return [{ componentId: t.componentId, path: t.dataBinding }] // 0.8
  }
  return c.child ? [c.child] : []
}

function plainText(ctx, cid, scope) {
  const c = ctx.surface.components.get(cid)
  if (!c) return cid
  if (c.type === 'Text') {
    const r = resolveValue(c.text, ctx.state.data, scope)
    return r == null ? '' : String(r)
  }
  return childIds(c).filter((x) => typeof x === 'string').map((x) => plainText(ctx, x, scope)).join(' ') || cid
}

function pressButton(ctx, c, scope) {
  const action = c.action ?? {}
  const ev = action.event ?? (action.name ? action : null) // 1.0 {event:{name,context}}; 0.8 {name, context}
  if (!ev || !ev.name) return
  const context = {}
  const rawCtx = ev.context ?? {}
  if (Array.isArray(rawCtx)) for (const kv of rawCtx) context[kv.key] = resolveValue(kv.value, ctx.state.data, scope) // 0.8
  else for (const [k, v] of Object.entries(rawCtx)) context[k] = resolveValue(v, ctx.state.data, scope)
  const payload = {
    surfaceId: ctx.surface.id,
    name: ev.name,
    sourceComponentId: c.id,
    timestamp: new Date().toISOString(),
    context,
    dataModel: ctx.state.data,
  }
  ctx.state.sent = ev.name
  ctx.redraw()
  const text =
    'A2UI action event from the user (they pressed a button in a surface you drew). ' +
    'Continue the task using these values:\n```json\n' + JSON.stringify(payload, null, 2) + '\n```'
  // Waits until Claude is idle, then starts a turn. Don't block the press handler on it.
  const p = ctx.submit(text)
  if (p && typeof p.catch === 'function') p.catch(() => {})
}
