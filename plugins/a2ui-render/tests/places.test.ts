import { expect, mock, test } from 'claude-code/testing'
import { demos } from './demos.generated.ts'

const reply = (name: string) => '<!-- a2ui\n' + demos.find((d) => d.name === name)!.body + '\n-->'
const msg = (text: string, id: string, surface: 'desktop' | 'terminal' = 'desktop') =>
  ({ plugin: 'a2ui-render', component: 'AssistantMessage', requestId: id, surface, viewport: { columns: 100, rows: 40 }, props: { text, isSummary: false } }) as any
const pane = (id: string, surface: 'desktop' | 'terminal' = 'desktop') =>
  ({ plugin: 'a2ui-render', component: 'Pane', requestId: id, surface, viewport: { columns: 140, rows: 40 }, props: { title: id, isFocused: true, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } }) as any
const band = (surface: 'desktop' | 'terminal' = 'desktop') =>
  ({ plugin: 'a2ui-render', component: 'AbovePrompt', requestId: 'above', surface, viewport: { columns: 120, rows: 40 }, props: { hasSurvey: false, isWorking: false, maxRows: 8, bodyColumns: 100, scroll: { offset: 0, bodyRows: 8 }, view: {} } }) as any
const engine = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }
const finish = ($: any, answer: string) => $.turn.complete({ turnId: 't' + Math.random(), answer, durationMs: 10, isAborted: false, usage: null })

function stubs(on: any, log: any) {
  on('ui.render', ($: any, e: any) => (e.component === 'Spinner' ? { type: 'Text', props: {}, children: ['suffix:' + (e.props?.suffix ?? 'none')] } : engine))
  on('turn.complete', () => ({ text: '' }))
  on('ui.open', ($: any, e: any) => { log.opened.push(e.id); return { value: { isPlaced: true } } })
  on('ui.close', ($: any, e: any) => { log.closed.push(e.id); return { value: undefined } })
  on('ui.toast', ($: any, e: any) => { log.toasts.push(e.text); return { value: undefined } })
  on('ui.status', ($: any, e: any) => { log.status.push(e.text ?? null); return { value: undefined } })
  on('prompt.submit', ($: any, e: any) => { log.sent.push(e.text); return { text: e.text } })
  on('command.register', () => ({ value: undefined }))
}
const newLog = () => ({ opened: [] as string[], closed: [] as string[], toasts: [] as string[], status: [] as any[], sent: [] as string[] })

test('pane: a finished reply opens the side pane; the message shows a pointer', async ($, on) => {
  const log = newLog(); stubs(on, log)
  const m = await $.ui.mount(msg(reply('demo-pane'), 'pm'))
  expect(await m.find({ type: 'Text', text: /Build dashboard — shown in the side pane/ })).toBeDefined()
  expect(await m.find({ key: 'chip-pm:live-dash:open' })).toBeDefined()
  await finish($, reply('demo-pane'))
  expect(log.opened).toContain('a2ui-pane-live-dash')
  expect(log.toasts).toContain('Build dashboard opened in the side pane')
  for (const surface of ['desktop', 'terminal'] as const) {
    const p = await $.ui.mount(pane('a2ui-pane-live-dash', surface))
    expect(await p.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
    expect(await p.find({ type: 'Text', text: 'Build dashboard' })).toBeDefined()
    expect(await p.find({ type: 'Text', text: '1,284' })).toBeDefined()
    expect(await p.find({ type: 'Text', text: /waiting for \.a2ui\/dashboard\.jsonl/ })).toBeDefined()
    await p.unmount()
  }
})

test('pane: a later reply updates the same form in place', async ($, on) => {
  const log = newLog(); stubs(on, log)
  await finish($, reply('demo-pane'))
  await finish($, 'Numbers updated.\n<!-- a2ui\n{"version":"1.0","updateDataModel":{"surfaceId":"live-dash","path":"/tests","value":"1,300"}}\n-->')
  const p = await $.ui.mount(pane('a2ui-pane-live-dash'))
  expect(await p.find({ type: 'Text', text: '1,300' })).toBeDefined()
})

test('pane: a refresh file updates the pane on a timer, and only its own surface', async ($, on) => {
  const log = newLog(); stubs(on, log)
  const clock = mock.clock(on)
  const reads: string[] = []
  on('fs.read', ($, e) => {
    reads.push(e.path)
    return { value: '{"version":"1.0","updateDataModel":{"surfaceId":"live-dash","path":"/tests","value":"2,000"}}\n{"version":"1.0","updateDataModel":{"surfaceId":"someone-else","path":"/x","value":1}}' }
  })
  await finish($, reply('demo-pane'))
  await clock.advance(5000)
  expect(reads.some((p) => p.endsWith('.a2ui/dashboard.jsonl'))).toBe(true)
  const p = await $.ui.mount(pane('a2ui-pane-live-dash'))
  expect(await p.find({ type: 'Text', text: '2,000' })).toBeDefined()
  expect(await p.find({ type: 'Text', text: /every 5 s from \.a2ui\/dashboard\.jsonl · updated/ })).toBeDefined()
})

test('pane: a refresh file outside .a2ui/ is ignored', async ($, on) => {
  const log = newLog(); stubs(on, log)
  const clock = mock.clock(on)
  const reads: string[] = []
  on('fs.read', ($, e) => { reads.push(e.path); return { value: '' } })
  await finish($, '<!-- a2ui\n{"version":"1.0","createSurface":{"surfaceId":"x","placement":"pane","refresh":{"file":"../secrets.json","every":2}}}\n{"version":"1.0","updateComponents":{"surfaceId":"x","components":[{"id":"root","component":"Text","text":"hi"}]}}\n-->')
  await clock.advance(10000)
  expect(reads).toEqual([])
})

test('band: shows above the prompt with a toast and status; answering sends and hides it', async ($, on) => {
  const log = newLog(); stubs(on, log)
  const m = await $.ui.mount(msg(reply('demo-band'), 'bm'))
  expect(await m.find({ type: 'Text', text: /Quick question — shown above the prompt/ })).toBeDefined()
  await finish($, reply('demo-band'))
  expect(log.toasts).toContain('Claude has a quick question for you')
  expect(log.status).toContain('a2ui: waiting for your answer above the prompt')
  for (const surface of ['desktop', 'terminal'] as const) {
    const b = await $.ui.mount(band(surface))
    expect(await b.find({ type: 'Text', text: 'Run the test suite now?' })).toBeDefined()
    await b.unmount()
  }
  const b = await $.ui.mount(band())
  await b.press({ key: 'band:run-tests:yes' })
  expect(log.sent.length).toBe(1)
  expect(log.sent[0]).toContain('"name": "run_tests"')
  expect(log.toasts).toContain('Sent “run_tests” to Claude')
  await b.unmount()
  const after = await $.ui.mount(band())
  expect(await after.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('band: the close button dismisses it without sending', async ($, on) => {
  const log = newLog(); stubs(on, log)
  await finish($, reply('demo-band'))
  const b = await $.ui.mount(band())
  await b.press({ key: 'band-run-tests:close' })
  await b.unmount()
  const after = await $.ui.mount(band())
  expect(await after.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
  expect(log.sent).toEqual([])
})

test('spinner: says "building form" while a block streams, and stops after the turn', async ($, on) => {
  const log = newLog(); stubs(on, log)
  const spinner = { plugin: 'a2ui-render', component: 'Spinner', requestId: 'main', surface: 'desktop', props: { word: 'Thinking', message: null, mode: 'normal' } } as any
  const before = await $.ui.mount(spinner)
  expect(await before.find({ type: 'Text', text: 'suffix:none' })).toBeDefined()
  await before.unmount()
  await $.ui.mount(msg('Here:\n<!-- a2ui\n{"version":"1.0"', 'sp'))
  const during = await $.ui.mount(spinner)
  expect(await during.find({ type: 'Text', text: 'suffix: · building form…' })).toBeDefined()
  await during.unmount()
  await finish($, 'done')
  const after = await $.ui.mount(spinner)
  expect(await after.find({ type: 'Text', text: 'suffix:none' })).toBeDefined()
})

test('commands: /a2ui-gallery opens a pane that draws demos locally; buttons only toast', async ($, on) => {
  const log = newLog(); stubs(on, log)
  await $.command.run({ command: 'a2ui-gallery', args: 'pricing' })
  expect(log.opened).toContain('a2ui-gallery')
  for (const surface of ['desktop', 'terminal'] as const) {
    const g = await $.ui.mount(pane('a2ui-gallery', surface))
    expect(await g.find({ type: 'Text', text: 'Choose a plan' })).toBeDefined()
    await g.unmount()
  }
  const g = await $.ui.mount(pane('a2ui-gallery'))
  await g.press({ key: 'gallery:demo-pricing:pricing:pro_btn' })
  expect(log.sent).toEqual([])
  expect(log.toasts.some((t) => t.includes('select_plan'))).toBe(true)
  await g.press({ key: 'gallery:pick:demo-dashboard' })
  expect(await g.find({ type: 'Text', text: 'Release health' })).toBeDefined()
})

test('commands: /a2ui-pane reopens the last pane, /a2ui-clear closes and clears', async ($, on) => {
  const log = newLog(); stubs(on, log)
  const none: any = await $.command.run({ command: 'a2ui-pane', args: '' })
  expect(none.text).toContain('No side-pane form yet')
  await finish($, reply('demo-pane'))
  log.opened.length = 0
  await $.command.run({ command: 'a2ui-pane', args: '' })
  expect(log.opened).toEqual(['a2ui-pane-live-dash'])
  await finish($, reply('demo-band'))
  const cleared: any = await $.command.run({ command: 'a2ui-clear', args: '' })
  expect(cleared.text).toContain('Cleared')
  expect(log.closed).toContain('a2ui-pane-live-dash')
  expect(log.status).toContain(null)
  const after = await $.ui.mount(band())
  expect(await after.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})
