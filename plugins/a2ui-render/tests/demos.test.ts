import { expect, test } from 'claude-code/testing'
import { demos } from './demos.generated.ts'

const site = (text: string, surface: 'terminal' | 'desktop', id: string) => ({
  plugin: 'a2ui-render',
  component: 'AssistantMessage',
  requestId: id,
  surface,
  viewport: { columns: 110, rows: 40 },
  props: { text: '```a2ui\n' + text + '\n```', isSummary: false },
} as const)

for (const d of demos) {
  for (const surface of ['desktop', 'terminal'] as const) {
    test(`${d.name} draws on ${surface} and its primary button reaches Claude`, async ($, on) => {
      const sent: string[] = []
      on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
      on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
      const id = `${d.name}-${surface}`
      const ui = await $.ui.mount(site(d.body, surface, id))
      expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
      expect(await ui.find({ type: 'Text', text: d.heading })).toBeDefined()
      await ui.press({ key: `${id}:${d.surfaceId}:${d.primary}` })
      expect(sent.length).toBe(1)
      expect(sent[0]).toContain(`"surfaceId": "${d.surfaceId}"`)
      await ui.unmount()
    })
  }
}

test('themes demo draws three surfaces with different looks', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const d = demos.find((x) => x.name === 'demo-themes')!
  const ui = await $.ui.mount(site(d.body, 'desktop', 't'))
  for (const name of ['Clean theme', 'Soft theme', 'Accent theme']) expect(await ui.find({ type: 'Text', text: name })).toBeDefined()
  // Soft puts labels above fields; clean and accent put them inside the input.
  expect(await ui.find({ key: 't:meeting-soft:who:field' })).toBeDefined()
  expect(await ui.find({ key: 't:meeting-clean:who:field' })).toBeUndefined()
  const accentCard = await ui.find({ key: 't:meeting-accent:card' })
  expect(accentCard?.props?.borderColor).toBe('permission')
})

test('tasks demo: checking a task in the list updates the saved list', async ($, on) => {
  const sent: string[] = []
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
  const d = demos.find((x) => x.name === 'demo-tasks')!
  const ui = await $.ui.mount(site(d.body, 'desktop', 'k'))
  await ui.press({ key: 'k:checklist:task_check#0.2' })
  await ui.press({ key: 'k:checklist:save' })
  const json = JSON.parse(sent[0].split('```json\n')[1].split('\n```')[0])
  expect(json.context.tasks[2].done).toBe(true)
})

test('settings demo: tabs switch content', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const d = demos.find((x) => x.name === 'demo-settings')!
  const ui = await $.ui.mount(site(d.body, 'terminal', 's'))
  expect(await ui.find({ key: 's:settings:g_name' })).toBeDefined()
  await ui.press({ key: 's:settings:tabs:tab2' })
  expect(await ui.find({ key: 's:settings:g_name' })).toBeUndefined()
  expect(await ui.find({ key: 's:settings:a_jobs' })).toBeDefined()
})

test('carousel: back and forward, dots, choices remembered, Done sends decisions', async ($, on) => {
  const sent: string[] = []
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
  const d = demos.find((x) => x.name === 'demo-swipe')!
  for (const surface of ['desktop', 'terminal'] as const) {
    const id = 'w-' + surface
    const ui = await $.ui.mount(site(d.body, surface, id))
    const k = (s: string) => `${id}:triage:stack${s}`
    const deckTitle = async () => JSON.stringify((await ui.find({ type: 'Client' }))?.props?.props?.cur ?? {})
    expect(await deckTitle()).toContain('Checkout button does nothing on Safari')
    expect(await ui.find({ type: 'Text', text: '1 / 8' })).toBeDefined()
    // Next, then Back
    await ui.press({ key: k(':next') })
    expect(await deckTitle()).toContain('Search returns duplicates after reindex')
    await ui.press({ key: k(':prev') })
    expect(await ui.find({ type: 'Text', text: '1 / 8' })).toBeDefined()
    // Choose "Fix now" on card 1: moves to card 2
    await ui.press({ key: k(':choice2') })
    expect(await ui.find({ type: 'Text', text: '2 / 8' })).toBeDefined()
    // Go back: the choice is still marked
    await ui.press({ key: k(':prev') })
    const picked = await ui.find({ key: k(':choice2') })
    expect(String(picked?.props?.label)).toContain('✓')
    // Change it to "Later", jump with a dot to card 5, choose "Skip"
    await ui.press({ key: k(':choice1') })
    await ui.press({ key: k(':dot4') })
    expect(await ui.find({ type: 'Text', text: '5 / 8' })).toBeDefined()
    await ui.press({ key: k(':choice0') })
    await ui.press({ key: k(':submit') })
    const json = JSON.parse(sent[sent.length - 1].split('```json\n')[1].split('\n```')[0])
    expect(json.name).toBe('triage')
    expect(json.context.decisions).toEqual({ '#812': 'later', '#821': 'skip' })
    await ui.unmount()
  }
})

test('carousel: loop wraps around and a button inside a card sends that card\'s values', async ($, on) => {
  const sent: string[] = []
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  on('prompt.submit', ($, e) => { sent.push(e.text); return { text: e.text } })
  const d = demos.find((x) => x.name === 'demo-swipe')!
  const ui = await $.ui.mount(site(d.body, 'desktop', 'n'))
  await ui.press({ key: 'n:names:deck:prev' })
  expect(await ui.find({ type: 'Text', text: 'forge' })).toBeDefined()
  await ui.press({ key: 'n:names:n_use#c3' })
  const json = JSON.parse(sent[0].split('```json\n')[1].split('\n```')[0])
  expect(json.context).toEqual({ name: 'forge' })
})

test('fallback text is hidden where the form is drawn, and mobile gets plain Markdown', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const d = demos.find((x) => x.name === 'demo')!
  const text = '<!-- a2ui:fallback -->\n' + d.fallback + '\n<!-- /a2ui:fallback -->\n\n```a2ui\n' + d.body + '\n```'
  const desk = await $.ui.mount({ plugin: 'a2ui-render', component: 'AssistantMessage', requestId: 'fb', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { text, isSummary: false } } as any)
  expect(await desk.find({ type: 'Markdown', text: /Reply with/ })).toBeUndefined()
  expect(await desk.find({ key: 'fb:deploy:deploy_btn' })).toBeDefined()
  await desk.unmount()
  const mob = await $.ui.mount({ plugin: 'a2ui-render', component: 'AssistantMessage', requestId: 'mb', surface: 'mobile', viewport: { columns: 40, rows: 40 }, props: { text, isSummary: false } } as any)
  const md = await mob.find({ type: 'Markdown' })
  expect(String(md?.props?.text)).toContain('Reply with')
  expect(await mob.find({ type: 'Button' })).toBeUndefined()
})

test('the hidden <!-- a2ui --> form draws like a fenced block, and streams with a placeholder', async ($, on) => {
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const d = demos.find((x) => x.name === 'demo')!
  const full = '<!-- a2ui:fallback -->\n' + d.fallback + '\n<!-- /a2ui:fallback -->\n\n<!-- a2ui\n' + d.body + '\n-->'
  for (const surface of ['desktop', 'terminal'] as const) {
    const ui = await $.ui.mount({ plugin: 'a2ui-render', component: 'AssistantMessage', requestId: 'hc' + surface, surface, viewport: { columns: 100, rows: 40 }, props: { text: full, isSummary: false } } as any)
    expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
    expect(await ui.find({ key: `hc${surface}:deploy:deploy_btn` })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', text: /Reply with/ })).toBeUndefined()
    await ui.unmount()
  }
  const partial = await $.ui.mount({ plugin: 'a2ui-render', component: 'AssistantMessage', requestId: 'hp', surface: 'desktop', viewport: { columns: 100, rows: 40 }, props: { text: '<!-- a2ui\n' + d.body.split('\n')[0], isSummary: false } } as any)
  expect(await partial.find({ type: 'Text', text: /Building UI/ })).toBeDefined()
})
