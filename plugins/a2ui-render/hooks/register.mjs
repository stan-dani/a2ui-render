// a2ui — render A2UI surfaces as native Claude Code UI.
//
// When Claude's reply contains a fenced block
//
//   ```a2ui
//   {"version":"1.0","createSurface":{...}}
//   {"version":"1.0","updateComponents":{...}}
//   ```
//
// this mod redraws the message: the Markdown around the block stays as it is, and the
// block becomes real controls (text, cards, rows, buttons, text fields, checkboxes,
// pickers). Pressing a button that carries an A2UI `event` action sends the action,
// with the surface's current data model, back to Claude as a new prompt.
//
// Works in the Code tab of the Claude Desktop app and in the terminal. Claude and the
// transcript keep the raw JSON; only the drawing changes.

import { parseA2UI, buildSurfaces, splitSegments, resolveValue, pointerGet, pointerSet, joinPath } from './a2ui-core.mjs'

const FENCE = /^ {0,3}(?:`{3,}|~{3,})[ \t]*a2ui[ \t\r]*$/im
const MAX_MARKDOWN = 10000

// Per-surface live state, keyed by `${messageId}:${surfaceId}`.
// { data, sent: null | string, tab: {componentId: index} }
const live = new Map()

export function register(on, options = {}) {
  const sendMode = String(options.send_as ?? 'mod')

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
      const tree = renderMessage(e, els, io)
      return tree ?? next(e)
    } catch (err) {
      // Never break the transcript: fall back to Claude Code's own drawing.
      return next(e)
    }
  })
}

// ---------------------------------------------------------------------------

function renderMessage(e, els, io) {
  const text = String(e.props?.text ?? '')
  const segments = splitSegments(text)
  if (!segments.some((s) => s.kind === 'a2ui')) return undefined

  const { Box, Text, Markdown, Code } = els
  const columns = Math.max(30, Math.min(100, (e.viewport?.columns ?? 80) - 4))
  const redraw = io.redraw
  const msgId = String(e.requestId ?? 'msg')

  const children = []
  segments.forEach((seg, i) => {
    if (seg.kind === 'md') {
      const md = seg.text.trim()
      if (!md) return
      children.push(
        md.length <= MAX_MARKDOWN
          ? Markdown({ key: `md-${i}`, text: md })
          : Text({ children: [md.slice(0, MAX_MARKDOWN)] }),
      )
      return
    }
    if (!seg.closed) {
      children.push(Text({ dimColor: true, children: ['◆ Building UI…'] }))
      return
    }
    let surfaces
    try {
      surfaces = buildSurfaces(parseA2UI(seg.text))
    } catch (err) {
      children.push(Text({ bold: true, children: ['A2UI could not be read: ' + err.message] }))
      children.push(Code({ key: `code-${i}`, source: seg.text.slice(0, 9000), language: 'json' }))
      return
    }
    for (const s of surfaces) {
      const id = `${msgId}:${s.id}`
      if (!live.has(id)) live.set(id, { data: structuredClone(s.data), sent: null, tab: {} })
      const state = live.get(id)
      const ctx = { els, surface: s, state, id, columns, redraw, submit: io.submit, msgId }
      children.push(renderSurface(ctx))
    }
  })

  return Box({ key: `a2ui-msg-${msgId}`, flexDirection: 'column', children })
}

function renderSurface(ctx) {
  const { els, surface, state } = ctx
  const { Box, Text } = els
  const body = surface.components.has(surface.root)
    ? renderComponent(ctx, surface.root, '', ctx.columns)
    : Text({ dimColor: true, children: [`(surface ${surface.id} has no root component)`] })
  const footer = state.sent
    ? [Text({ dimColor: true, children: [`✓ Sent “${state.sent}” to Claude`] })]
    : []
  return Box({
    key: `surface-${ctx.id}`,
    flexDirection: 'column',
    marginTop: 1,
    marginBottom: 1,
    children: [body, ...footer],
  })
}

// Render one component. `scope` is the data path that relative bindings resolve against
// (used inside list templates). `width` is a soft hint in columns.
function renderComponent(ctx, cid, scope, width, depth = 0, suffix = '') {
  const { els, surface, state } = ctx
  const { Box, Text, Button, Input, Select, Link, Markdown } = els
  const c = surface.components.get(cid)
  const key = (k = '') => `${ctx.id}:${cid}${suffix}${k}`
  if (!c) return Text({ key: key(':missing'), dimColor: true, children: [`‹missing ${cid}›`] })
  if (depth > 40) return Text({ key: key(':deep'), dimColor: true, children: ['‹too deep›'] })

  const val = (v) => resolveValue(v, state.data, scope)
  const str = (v) => {
    const r = val(v)
    return r == null ? '' : typeof r === 'object' ? JSON.stringify(r) : String(r)
  }
  const bindPath = (v) => (v && typeof v === 'object' && typeof (v.path ?? v['@path']) === 'string' ? joinPath(scope, v.path ?? v['@path']) : null)
  const kids = (w) => childIds(c).flatMap((ch, i) => {
    if (typeof ch === 'string') return [renderComponent(ctx, ch, scope, w, depth + 1, suffix)]
    // template: { componentId, path }
    const items = pointerGet(state.data, joinPath(scope, ch.path))
    if (!Array.isArray(items)) return []
    return items.map((_, j) => renderComponent(ctx, ch.componentId, joinPath(scope, ch.path) + '/' + j, w, depth + 1, `${suffix}#${i}.${j}`))
  })

  switch (c.type) {
    case 'Text': {
      const v = c.variant ?? c.usageHint
      const t = str(c.text)
      // Text sizes the app understands: caption, footnote, body, heading, title.
      if (v === 'h1') return Text({ key: key(), size: 'title', weight: 'semibold', bold: true, children: [t] })
      if (v === 'h2' || v === 'h3') return Text({ key: key(), size: 'heading', weight: 'semibold', bold: true, children: [t] })
      if (v === 'h4' || v === 'h5') return Text({ key: key(), weight: 'semibold', bold: true, children: [t] })
      if (v === 'caption') return Text({ key: key(), size: 'caption', dimColor: true, children: [t] })
      return Text({ key: key(), children: [t] })
    }
    case 'Column':
    case 'List':
      return Box({ key: key(), flexDirection: 'column', rowGap: 'sm', children: kids(width) })
    case 'Row': {
      const n = Math.max(1, childIds(c).length)
      return Box({ key: key(), flexDirection: 'row', columnGap: 'md', alignItems: 'center', flexWrap: 'wrap', children: kids(Math.floor(width / n)) })
    }
    case 'Card':
      return Box({ key: key(), flexDirection: 'column', borderStyle: 'round', paddingX: 'md', paddingY: 'sm', children: kids(width - 4) })
    case 'Divider':
      // A Markdown rule: full width in the app and in the terminal.
      return Markdown({ key: key(), text: '---' })
    case 'Button': {
      const label = c.child ? plainText(ctx, c.child, scope) : str(c.label) || cid
      return Button({
        key: key(),
        label,
        ...(c.variant === 'primary' || c.primary === true ? { variant: 'primary' } : {}),
        onPress: () => pressButton(ctx, c, scope),
      })
    }
    case 'TextField':
    case 'DateTimeInput': {
      const p = bindPath(c.value ?? c.text)
      const current = p ? pointerGet(state.data, p) : val(c.value ?? c.text)
      const label = str(c.label) || (c.type === 'DateTimeInput' ? 'Date' : '')
      return Input({
        key: key(),
        label: label || ' ',
        placeholder: str(c.placeholder) || (c.type === 'DateTimeInput' ? 'YYYY-MM-DD' : ''),
        value: current == null ? '' : String(current),
        onInput: (v) => { if (p) pointerSet(state.data, p, v) },
        onSubmit: (v) => { if (p) pointerSet(state.data, p, v); ctx.redraw() },
      })
    }
    case 'CheckBox': {
      const p = bindPath(c.value)
      const on = (p ? pointerGet(state.data, p) : val(c.value)) === true
      return Button({
        key: key(),
        plain: true,
        label: `${on ? '☑' : '☐'} ${str(c.label)}`,
        onPress: () => { if (p) { pointerSet(state.data, p, !on); ctx.redraw() } },
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
      if (Array.isArray(cur)) cur = cur[0]
      const value = opts.some((o) => o.value === String(cur)) ? String(cur) : opts[0].value
      const multi = Array.isArray(p ? pointerGet(state.data, p) : undefined)
      return Select({
        key: key(),
        label: str(c.label) || ' ',
        options: opts,
        value,
        onSelect: (v) => { if (p) pointerSet(state.data, p, multi ? [v] : v); ctx.redraw() },
      })
    }
    case 'Slider': {
      const p = bindPath(c.value)
      const min = Number(val(c.min) ?? 0), max = Number(val(c.max) ?? 100)
      const step = Math.max((max - min) / 20, Number(val(c.step) ?? 1) || 1)
      const opts = []
      for (let x = min; x <= max + 1e-9 && opts.length < 21; x += step) opts.push({ value: String(Math.round(x * 100) / 100), label: String(Math.round(x * 100) / 100) })
      const cur = String(p ? pointerGet(state.data, p) ?? min : val(c.value) ?? min)
      return Select({
        key: key(),
        label: str(c.label) || 'Value',
        options: opts,
        value: opts.some((o) => o.value === cur) ? cur : opts[0].value,
        onSelect: (v) => { if (p) pointerSet(state.data, p, Number(v)); ctx.redraw() },
      })
    }
    case 'Tabs': {
      const tabs = Array.isArray(c.tabs) ? c.tabs : (Array.isArray(c.tabItems) ? c.tabItems : [])
      if (!tabs.length) return Box({ key: key(), flexDirection: 'column', children: kids(width) })
      const active = Math.min(state.tab[cid] ?? 0, tabs.length - 1)
      const bar = Box({
        key: key(':bar'), flexDirection: 'row', columnGap: 2,
        children: tabs.map((t, i) => Button({
          key: key(':tab' + i), plain: true, dimColor: i !== active,
          label: str(t.title) || `Tab ${i + 1}`,
          onPress: () => { state.tab[cid] = i; ctx.redraw() },
        })),
      })
      const childId = tabs[active].child ?? tabs[active].content
      return Box({ key: key(), flexDirection: 'column', children: [bar, childId ? renderComponent(ctx, childId, scope, width, depth + 1, suffix) : Text({ key: key(':empty'), children: [''] })] })
    }
    case 'Modal': {
      const content = c.content ?? c.contentChild ?? c.child
      return Box({ key: key(), flexDirection: 'column', borderStyle: 'round', paddingLeft: 1, paddingRight: 1, children: content ? [renderComponent(ctx, content, scope, width - 4, depth + 1, suffix)] : [] })
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
    default:
      return Box({
        key: key(), flexDirection: 'column',
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
