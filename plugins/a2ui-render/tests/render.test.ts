import { expect, test } from 'claude-code/testing'
import { demo } from './demo-fixture.ts'

const reply = (body: string) => 'Here is the form:\n\n```a2ui\n' + body + '\n```\n\nPress a button when ready.'

const site = (text: string, surface: 'terminal' | 'desktop', id = 'msg-1') => ({
  plugin: 'a2ui-render',
  component: 'AssistantMessage',
  requestId: id,
  surface,
  viewport: { columns: 100, rows: 40 },
  props: { text, isSummary: false },
} as const)

const engineDraws = { type: 'Text', props: {}, children: ['drawn by Claude Code'] }

for (const surface of ['desktop', 'terminal'] as const) {
  test(`${surface}: draws the demo surface as native controls`, async ($, on) => {
    on('ui.render', () => engineDraws)
    const ui = await $.ui.mount(site(reply(demo), surface, 'm-' + surface))
    expect(await ui.find({ type: 'Markdown' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Deploy request' })).toBeDefined()
    expect(await ui.find({ key: `m-${surface}:deploy:branch` })).toBeDefined()
    expect(await ui.find({ key: `m-${surface}:deploy:env` })).toBeDefined()
    expect(await ui.find({ key: `m-${surface}:deploy:deploy_btn` })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
    await ui.unmount()
  })
}

test('pressing a button sends the action with edited values back to Claude', async ($, on) => {
  const sent: string[] = []
  on('ui.render', () => engineDraws)
  on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
  const ui = await $.ui.mount(site(reply(demo), 'desktop', 'm-press'))
  await ui.input({ key: 'm-press:deploy:branch', text: 'release/2.4' })
  await ui.select({ key: 'm-press:deploy:env', value: 'production' })
  await ui.press({ key: 'm-press:deploy:notify' }) // toggles true -> false
  await ui.press({ key: 'm-press:deploy:deploy_btn' })
  expect(sent.length).toBe(1)
  const json = JSON.parse(sent[0].split('```json\n')[1].split('\n```')[0])
  expect(json.name).toBe('deploy')
  expect(json.surfaceId).toBe('deploy')
  expect(json.context).toEqual({ branch: 'release/2.4', env: 'production', notify: false })
  expect(await ui.find({ type: 'Text', text: /Sent “deploy”/ })).toBeDefined()
})

test('a block that is still streaming shows a placeholder, not raw JSON', async ($, on) => {
  on('ui.render', () => engineDraws)
  const partial = 'Working on it:\n\n```a2ui\n' + demo.split('\n')[0]
  const ui = await $.ui.mount(site(partial, 'desktop', 'm-stream'))
  expect(await ui.find({ type: 'Text', text: /Building UI/ })).toBeDefined()
})

test('invalid JSON shows an error and the raw block', async ($, on) => {
  on('ui.render', () => engineDraws)
  const ui = await $.ui.mount(site(reply('{"version":"1.0", oops'), 'desktop', 'm-bad'))
  expect(await ui.find({ type: 'Text', text: /could not be read/ })).toBeDefined()
  expect(await ui.find({ type: 'Code' })).toBeDefined()
})

test('a message without an a2ui block is left to Claude Code', async ($, on) => {
  on('ui.render', () => engineDraws)
  const ui = await $.ui.mount(site('Just text, and some code:\n\n```js\nconsole.log(1)\n```', 'desktop', 'm-plain'))
  expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeDefined()
})

test('list templates repeat a row for each item', async ($, on) => {
  on('ui.render', () => engineDraws)
  const body = [
    '{"version":"1.0","createSurface":{"surfaceId":"todo","catalogId":"basic"}}',
    '{"version":"1.0","updateComponents":{"surfaceId":"todo","components":[{"id":"root","component":"List","children":{"componentId":"row","path":"/items"}},{"id":"row","component":"Text","text":{"path":"name"}}]}}',
    '{"version":"1.0","updateDataModel":{"surfaceId":"todo","path":"/","value":{"items":[{"name":"Buy milk"},{"name":"Call Bob"}]}}}',
  ].join('\n')
  const ui = await $.ui.mount(site(reply(body), 'terminal', 'm-list'))
  expect(await ui.find({ type: 'Text', text: 'Buy milk' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'Call Bob' })).toBeDefined()
})

test('every documented component draws on both surfaces', async ($, on) => {
  on('ui.render', () => engineDraws)
  const comps = [
    { id: 'root', component: 'Column', children: ['h', 'cap', 'row', 'card', 'div', 'tf', 'cb', 'cp', 'sl', 'dt', 'tabs', 'img', 'icon', 'modal', 'unknown', 'btn'] },
    { id: 'h', component: 'Text', text: 'Heading', variant: 'h1' },
    { id: 'cap', component: 'Text', text: 'Caption', variant: 'caption' },
    { id: 'row', component: 'Row', children: ['a', 'b'] },
    { id: 'a', component: 'Text', text: 'A' },
    { id: 'b', component: 'Text', text: 'B' },
    { id: 'card', component: 'Card', child: 'a' },
    { id: 'div', component: 'Divider' },
    { id: 'tf', component: 'TextField', label: 'Name', value: { path: '/name' }, placeholder: 'Ada' },
    { id: 'cb', component: 'CheckBox', label: 'OK', value: { path: '/ok' } },
    { id: 'cp', component: 'ChoicePicker', label: 'Size', options: [{ label: 'S', value: 's' }, { label: 'L', value: 'l' }], value: { path: '/size' } },
    { id: 'sl', component: 'Slider', label: 'Level', min: 0, max: 10, value: { path: '/level' } },
    { id: 'dt', component: 'DateTimeInput', label: 'When', value: { path: '/when' } },
    { id: 'tabs', component: 'Tabs', tabs: [{ title: 'One', child: 'a' }, { title: 'Two', child: 'b' }] },
    { id: 'img', component: 'Image', url: 'https://example.com/x.png', description: 'Logo' },
    { id: 'icon', component: 'Icon', name: 'star' },
    { id: 'modal', component: 'Modal', content: 'b' },
    { id: 'unknown', component: 'FancyWidget', child: 'a' },
    { id: 'btn', component: 'Button', child: 'bt', action: { event: { name: 'go' } } },
    { id: 'bt', component: 'Text', text: 'Go' },
  ]
  const body = [
    JSON.stringify({ version: '1.0', createSurface: { surfaceId: 'all', catalogId: 'basic' } }),
    JSON.stringify({ version: '1.0', updateComponents: { surfaceId: 'all', components: comps } }),
    JSON.stringify({ version: '1.0', updateDataModel: { surfaceId: 'all', path: '/', value: { name: '', ok: false, size: 'l', level: 5, when: '' } } }),
  ].join('\n')
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount(site(reply(body), surface, 'm-all-' + surface))
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'Heading' })).toBeDefined()
    await ui.press({ key: `m-all-${surface}:all:tabs:tab1` })
    expect(await ui.find({ type: 'Text', text: 'B' })).toBeDefined()
    await ui.unmount()
  }
})
