// a2ui-core — pure helpers: find ```a2ui blocks in Markdown, parse A2UI messages,
// build surfaces (components + data model), resolve data bindings.
// No Claude Code APIs here, so this file is easy to unit test.

const OPEN = /^( {0,3})(`{3,}|~{3,})[ \t]*([^\s`]*)[^\n`]*$/
const CLOSE = /^ {0,3}(`{3,}|~{3,})[ \t\r]*$/

// Split Markdown into [{kind:'md', text}, {kind:'a2ui', text, closed}].
// Other fenced blocks (```js etc.) stay inside Markdown segments untouched.
export function splitSegments(markdown) {
  const lines = String(markdown).split('\n')
  const out = []
  let md = []
  let fence = null // { marker, isA2ui, buf }
  const flushMd = () => { if (md.length) { out.push({ kind: 'md', text: md.join('\n') }); md = [] } }
  for (const line of lines) {
    if (!fence) {
      const m = OPEN.exec(line)
      if (m) {
        const isA2ui = m[3].toLowerCase() === 'a2ui'
        fence = { marker: m[2], isA2ui, buf: [] }
        if (isA2ui) flushMd(); else md.push(line)
        continue
      }
      md.push(line)
      continue
    }
    const c = CLOSE.exec(line)
    if (c && c[1][0] === fence.marker[0] && c[1].length >= fence.marker.length) {
      if (fence.isA2ui) out.push({ kind: 'a2ui', text: fence.buf.join('\n'), closed: true })
      else md.push(line)
      fence = null
      continue
    }
    if (fence.isA2ui) fence.buf.push(line); else md.push(line)
  }
  if (fence && fence.isA2ui) out.push({ kind: 'a2ui', text: fence.buf.join('\n'), closed: false })
  flushMd()
  return out
}

// Accepts JSONL (one message per line), a JSON array of messages, or one message object.
export function parseA2UI(src) {
  const t = String(src).trim()
  if (!t) throw new Error('the block is empty')
  try {
    const v = JSON.parse(t)
    return Array.isArray(v) ? v : [v]
  } catch (whole) {
    const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) throw new Error(whole.message)
    return lines.map((l, i) => {
      try { return JSON.parse(l) } catch (err) { throw new Error(`line ${i + 1}: ${err.message}`) }
    })
  }
}

// Apply messages in order. Supports A2UI 1.0/0.9 names and 0.8 names.
export function buildSurfaces(messages) {
  const surfaces = new Map()
  const get = (id = 'default') => {
    if (!surfaces.has(id)) surfaces.set(id, { id, components: new Map(), data: {}, root: 'root', catalogId: null, theme: null })
    return surfaces.get(id)
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object') continue
    if (m.createSurface) {
      const s = get(m.createSurface.surfaceId)
      s.catalogId = m.createSurface.catalogId ?? null
      if (m.createSurface.theme !== undefined) s.theme = m.createSurface.theme
      if (m.createSurface.root) s.root = m.createSurface.root
    }
    const uc = m.updateComponents ?? m.surfaceUpdate
    if (uc) {
      const s = get(uc.surfaceId)
      for (const raw of uc.components ?? []) {
        if (!raw || !raw.id) continue
        let type = raw.component
        let props = raw
        if (type && typeof type === 'object') { // 0.8: {id, component: {Text: {...}}}
          const k = Object.keys(type)[0]
          props = { ...type[k] }
          type = k
        }
        s.components.set(raw.id, { ...props, id: raw.id, type: String(type ?? 'Unknown') })
      }
    }
    const ud = m.updateDataModel ?? m.dataModelUpdate
    if (ud) {
      const s = get(ud.surfaceId)
      let value = ud.value
      if (value === undefined && Array.isArray(ud.contents)) value = fromV08Contents(ud.contents)
      s.data = pointerSet(s.data, ud.path ?? '/', value === undefined ? null : value)
    }
    if (m.beginRendering) get(m.beginRendering.surfaceId).root = m.beginRendering.root ?? 'root'
    if (m.deleteSurface) surfaces.delete(m.deleteSurface.surfaceId)
  }
  return [...surfaces.values()]
}

function fromV08Contents(list) {
  const o = {}
  for (const e of list) {
    if (!e || !e.key) continue
    o[e.key] = e.valueString ?? e.valueNumber ?? e.valueBoolean ?? (e.valueMap ? fromV08Contents(e.valueMap) : null)
  }
  return o
}

// ---- data model ----

export function joinPath(scope, p) {
  if (p == null) return scope || '/'
  p = String(p)
  if (p.startsWith('/')) return p
  const base = scope && scope !== '/' ? scope : ''
  return base + '/' + p
}

const unesc = (k) => k.replace(/~1/g, '/').replace(/~0/g, '~')

export function pointerGet(obj, ptr) {
  if (!ptr || ptr === '/') return obj
  let o = obj
  for (const k of String(ptr).split('/').slice(1)) {
    if (o == null) return undefined
    o = o[unesc(k)]
  }
  return o
}

// Mutates and returns the root (which may be replaced when ptr is '/').
export function pointerSet(root, ptr, value) {
  if (!ptr || ptr === '/') {
    if (value && typeof value === 'object' && !Array.isArray(value) && root && typeof root === 'object') return Object.assign(root, value)
    return value ?? {}
  }
  if (!root || typeof root !== 'object') root = {}
  const keys = String(ptr).split('/').slice(1).map(unesc)
  let o = root
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i]
    if (o[k] == null || typeof o[k] !== 'object') o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {}
    o = o[k]
  }
  const last = keys[keys.length - 1]
  if (value === null) delete o[last]
  else o[last] = value
  return root
}

// A value in a component prop: literal, {path}, {"@path"}, or 0.8 {literalString...}.
// Simple {"call": "formatString"} functions are not evaluated; their args are joined.
export function resolveValue(v, data, scope = '') {
  if (v == null) return v
  if (typeof v !== 'object') return v
  if (Array.isArray(v)) return v.map((x) => resolveValue(x, data, scope))
  const p = v.path ?? v['@path']
  if (typeof p === 'string') return pointerGet(data, joinPath(scope, p))
  if ('literalString' in v) return v.literalString
  if ('literalNumber' in v) return v.literalNumber
  if ('literalBoolean' in v) return v.literalBoolean
  if ('literal' in v) return v.literal
  if (v.call && Array.isArray(v.args)) return v.args.map((a) => resolveValue(a, data, scope)).join('')
  const out = {}
  for (const [k, x] of Object.entries(v)) out[k] = resolveValue(x, data, scope)
  return out
}
