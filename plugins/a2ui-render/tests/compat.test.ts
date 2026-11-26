import { expect, test } from 'claude-code/testing'
import { demos } from './demos.generated.ts'

const mountDemo = async ($: any, name: string, id: string, surface: 'desktop' | 'terminal' = 'desktop') => {
  const d = demos.find((x) => x.name === name)!
  return $.ui.mount({ plugin: 'a2ui-render', component: 'AssistantMessage', requestId: id, surface, viewport: { columns: 100, rows: 40 }, props: { text: '<!-- a2ui\n' + d.body + '\n-->', isSummary: false } } as any)
}
const findAll = (n: any, pred: (n: any) => boolean, out: any[] = []) => { if (n && typeof n === 'object') { if (pred(n)) out.push(n); for (const c of n.children ?? []) findAll(c, pred, out) } return out }

for (const [version, compat] of [['2.1.290', true], ['2.1.332', false], ['2.2.0', false]] as const) {
  test(`Claude Code ${version}: ${compat ? 'compatible' : 'full'} mode draws every demo`, async ($, on) => {
    on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
    on('session.version', () => ({ value: version }))
    on('command.register', () => ({ value: undefined }))
    on('session.start', () => ({ cwd: '/work' }))
    await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
    for (const d of demos) {
      for (const surface of ['desktop', 'terminal'] as const) {
        const ui = await mountDemo($, d.name, `${d.name}-${version}-${surface}`, surface)
        expect(await ui.find({ type: 'Text', text: 'drawn by Claude Code' })).toBeUndefined()
        expect(await ui.find({ type: 'Text', text: d.heading })).toBeDefined()
        const hasClient = !!(await ui.find({ type: 'Client' }))
        const hasSvg = !!(await ui.find({ type: 'Svg' }))
        if (compat) { expect(hasClient).toBe(false); expect(hasSvg).toBe(false) }
        await ui.unmount()
      }
    }
  })
}

test('/a2ui-doctor reports the version and mode', async ($, on) => {
  on('session.version', () => ({ value: '2.1.290' }))
  on('command.register', () => ({ value: undefined }))
  on('session.start', () => ({ cwd: '/work' }))
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const answer: any = await $.command.run({ command: 'a2ui-doctor', args: '' })
  expect(answer.text).toContain('Claude Code 2.1.290')
  expect(answer.text).toContain('compatible mode')
})
