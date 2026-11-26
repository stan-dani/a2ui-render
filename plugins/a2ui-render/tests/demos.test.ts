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
