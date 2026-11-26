import { expect, test } from 'claude-code/testing'
import SwipeDeck from '../hooks/swipe-deck.mjs'
import { register as registerMod } from '../hooks/register.mjs'
import { demos } from './demos.generated.ts'

// A stand-in for the surface Claude Code hands a surface module.
function fakeSurface(columns = 60, rows = 10) {
  const h = (type) => (props) => { const { children, ...rest } = props ?? {}; return { type, props: rest, children: children ?? [] } }
  const timers: Array<() => void> = []
  const s: any = {
    elements: { Box: h('Box'), Text: h('Text'), Button: h('Button') },
    state: undefined, columns, rows, isMotionReduced: false, posts: [] as any[],
    pointer: null as any, key: null as any,
    setState(next: any) { s.state = next },
    every(ms: number, fn: () => void) { timers.push(fn); return () => { const i = timers.indexOf(fn); if (i >= 0) timers.splice(i, 1) } },
    onPointer(fn: any) { s.pointer = fn; return () => {} },
    onKey(fn: any) { s.key = fn; return () => {} },
    post(data: any) { s.posts.push(data) },
    flush() { for (let i = 0; i < 50 && timers.length; i++) for (const fn of [...timers]) fn() },
  }
  return s
}
const card = (t: string) => ({ k: 'col', c: [{ k: 'text', s: t, st: { bold: true } }] })
const base = { index: 1, count: 3, cur: card('Two'), next: card('Three'), prev: card('One'), canBack: true, canNext: true, accent: 'claude', cardBg: 'userMessageBackground' }
const topLeft = (tree: any) => tree.children[tree.children.length - 1]?.props?.left ?? tree.children.find((c: any) => c.props?.top === 0)?.props?.left

test('drag left past the threshold posts next', async () => {
  const s = fakeSurface()
  SwipeDeck(base, s)
  s.pointer({ kind: 'down', col: 30, row: 3 })
  s.pointer({ kind: 'move', col: 20, row: 3 })
  const mid = SwipeDeck(base, s)
  expect(JSON.stringify(mid)).toContain('Next ›')
  s.pointer({ kind: 'up', col: 12, row: 3 })
  s.flush()
  expect(s.posts).toEqual([{ type: 'go', delta: 1 }])
})

test('drag right past the threshold posts back', async () => {
  const s = fakeSurface()
  SwipeDeck(base, s)
  s.pointer({ kind: 'down', col: 10, row: 3 })
  s.pointer({ kind: 'up', col: 30, row: 3 })
  s.flush()
  expect(s.posts).toEqual([{ type: 'go', delta: -1 }])
})

test('a short drag springs back and posts nothing', async () => {
  const s = fakeSurface()
  SwipeDeck(base, s)
  s.pointer({ kind: 'down', col: 30, row: 3 })
  s.pointer({ kind: 'up', col: 26, row: 3 })
  s.flush()
  expect(s.posts).toEqual([])
  expect(s.state.dx).toBe(0)
})

test('the first card cannot go back', async () => {
  const s = fakeSurface()
  const first = { ...base, index: 0, prev: null, canBack: false }
  SwipeDeck(first, s)
  s.pointer({ kind: 'down', col: 10, row: 3 })
  s.pointer({ kind: 'up', col: 40, row: 3 })
  s.flush()
  expect(s.posts).toEqual([])
})

test('arrow keys move too, and a new index resets the drag', async () => {
  const s = fakeSurface()
  SwipeDeck(base, s)
  s.key({ key: 'right' })
  s.flush()
  expect(s.posts).toEqual([{ type: 'go', delta: 1 }])
  const tree = SwipeDeck({ ...base, index: 2, cur: card('Three'), next: null, canNext: false }, s)
  expect(JSON.stringify(tree)).toContain('Three')
  expect(JSON.stringify(tree)).toContain('"left":0')
})

test('the mod draws a Client deck for swipe carousels', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const d = demos.find((x) => x.name === 'demo-swipe')!
  const ui = await $.ui.mount({ plugin: 'a2ui-render', component: 'AssistantMessage', requestId: 'sw', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { text: '```a2ui\n' + d.body + '\n```', isSummary: false } } as any)
  const client = await ui.find({ type: 'Client' })
  expect(client?.props?.module).toBe('hooks/swipe-deck.mjs')
  expect(JSON.stringify(client?.props?.props?.cur)).toContain('Checkout button')
  expect(client?.props?.props?.canBack).toBe(false)
})

test('the mod answers a swipe post with the next card', async () => {
  // Call the mod's own hooks with a minimal stand-in for Claude Code.
  const hooks: Record<string, any> = {}
  registerMod((event: string, a: any, b?: any) => { hooks[event] = b ?? a }, {})
  const h = (type: string) => (props: any) => { const { children, ...rest } = props ?? {}; return { type, props: rest, children: children ?? [] } }
  const els: any = new Proxy({}, { get: (_, name: string) => h(name) })
  let redraws = 0
  const api: any = { ui: { resolve: () => els, invalidate: () => { redraws++ } }, prompt: { submit: () => Promise.resolve() } }
  const d = demos.find((x) => x.name === 'demo-swipe')!
  const e = { component: 'AssistantMessage', requestId: 'sw2', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { text: '```a2ui\n' + d.body + '\n```' } }
  const tree = await hooks['ui.render'](api, e, async () => null)
  const find = (n: any, pred: (n: any) => boolean): any => (n && typeof n === 'object') ? (pred(n) ? n : (n.children ?? []).map((c: any) => find(c, pred)).find(Boolean)) : undefined
  const client = find(tree, (n) => n.type === 'Client')
  const answer = await hooks['ui.message'](api, { element: client.props.key, data: { type: 'go', delta: 1 } }, async () => ({}))
  expect(JSON.stringify(answer.props.cur)).toContain('Search returns duplicates')
  expect(answer.props.index).toBe(1)
  expect(redraws).toBe(1)
  const back = await hooks['ui.message'](api, { element: client.props.key, data: { type: 'go', delta: -1 } }, async () => ({}))
  expect(back.props.index).toBe(0)
  const other = await hooks['ui.message'](api, { element: 'someone-else', data: {} }, async () => ({ passed: true }))
  expect(other).toEqual({ passed: true })
})
