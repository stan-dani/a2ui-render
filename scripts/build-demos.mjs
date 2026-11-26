#!/usr/bin/env node
// Generates the demo surfaces from one source:
//   plugins/a2ui-render/fixtures/<name>.jsonl     the A2UI messages
//   plugins/a2ui-render/skills/<skill>/SKILL.md   the /a2ui-render:<skill> command
//   plugins/a2ui-render/tests/demos.generated.ts  test fixtures
// Run: node scripts/build-demos.mjs

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSurfaces } from '../plugins/a2ui-render/hooks/a2ui-core.mjs'
import { surfaceToMarkdown } from '../plugins/a2ui-render/hooks/plain.mjs'

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'plugins', 'a2ui-render')
const V = '1.0'
const P = (path) => ({ path })

// ---- tiny builders ----
const text = (id, t, variant) => ({ id, component: 'Text', text: t, ...(variant ? { variant } : {}) })
const col = (id, children) => ({ id, component: 'Column', children })
const row = (id, children, extra = {}) => ({ id, component: 'Row', children, ...extra })
const card = (id, child, extra = {}) => ({ id, component: 'Card', child, ...extra })
const btn = (id, label, name, context, primary) => [
  { id, component: 'Button', child: id + '_t', action: { event: { name, ...(context ? { context } : {}) } }, ...(primary ? { variant: 'primary' } : {}) },
  text(id + '_t', label),
]
const field = (id, label, path, placeholder) => ({ id, component: 'TextField', label, value: P(path), ...(placeholder ? { placeholder } : {}) })
const check = (id, label, path) => ({ id, component: 'CheckBox', label, value: P(path) })
const pick = (id, label, path, options) => ({ id, component: 'ChoicePicker', label, value: P(path), options: options.map(([value, l]) => ({ value, label: l })) })
const badge = (id, t, tone) => ({ id, component: 'Badge', text: t, ...(tone ? { tone } : {}) })
const divider = (id) => ({ id, component: 'Divider' })

function surface(surfaceId, components, data, theme) {
  return [
    { version: V, createSurface: { surfaceId, catalogId: 'https://github.com/stan-dani/a2ui-render/catalog/v1', ...(theme ? { theme } : {}) } },
    { version: V, updateComponents: { surfaceId, components } },
    ...(data ? [{ version: V, updateDataModel: { surfaceId, path: '/', value: data } }] : []),
  ]
}

// ---- demos ----
const demos = []

// 1. deploy (the original demo; theme from settings)
demos.push({
  skill: 'demo', fixture: 'demo', title: 'a deploy form',
  heading: 'Deploy request', primary: 'deploy_btn', surfaceId: 'deploy',
  messages: surface('deploy', [
    col('root', ['title', 'card']),
    text('title', 'Deploy request', 'h2'),
    card('card', 'form'),
    col('form', ['desc', 'info', 'div1', 'branch', 'env', 'notify', 'actions']),
    text('desc', 'Review the release below and confirm the deployment.'),
    row('info', ['svc', 'ver']),
    text('svc', 'Service: checkout-api'),
    text('ver', 'Version: 2.4.1'),
    divider('div1'),
    field('branch', 'Branch', '/branch'),
    pick('env', 'Environment', '/env', [['staging', 'Staging'], ['production', 'Production']]),
    check('notify', 'Notify #deploys channel', '/notify'),
    row('actions', ['cancel_btn', 'deploy_btn']),
    ...btn('cancel_btn', 'Cancel', 'cancel'),
    ...btn('deploy_btn', 'Deploy', 'deploy', { branch: P('/branch'), env: P('/env'), notify: P('/notify') }, true),
  ], { branch: 'main', env: 'staging', notify: true }),
})

// 2. themes: the same small form in each theme
const themed = (name, theme, label) => surface(`meeting-${name}`, [
  col('root', ['head', 'card']),
  row('head', ['title', 'tag']),
  text('title', `${label} theme`, 'h3'),
  badge('tag', name, name === 'accent' ? 'accent' : 'neutral'),
  card('card', 'form'),
  col('form', ['who', 'len', 'invite', 'note', 'actions']),
  field('who', 'Attendee', '/who', 'name@company.com'),
  pick('len', 'Duration', '/len', [['15', '15 minutes'], ['30', '30 minutes'], ['60', '1 hour']]),
  check('invite', 'Send a calendar invite', '/invite'),
  { id: 'note', component: 'Callout', tone: 'info', text: 'Times are shown in your time zone.' },
  row('actions', ['cancel', 'book']),
  ...btn('cancel', 'Cancel', 'cancel'),
  ...btn('book', 'Book meeting', 'book', { who: P('/who'), len: P('/len'), invite: P('/invite'), theme: name }, true),
], { who: '', len: '30', invite: true }, theme)
demos.push({
  skill: 'demo-themes', fixture: 'themes', title: 'the same form in the clean, soft and accent themes',
  heading: 'Clean theme', primary: 'book', surfaceId: 'meeting-clean',
  messages: [...themed('clean', 'clean', 'Clean'), ...themed('soft', 'soft', 'Soft'), ...themed('accent', { name: 'accent', accent: 'blue' }, 'Accent')],
})

// 3. signup (soft)
demos.push({
  skill: 'demo-signup', fixture: 'signup', title: 'a sign-up form',
  heading: 'Create your workspace', primary: 'create', surfaceId: 'signup',
  messages: surface('signup', [
    card('root', 'form'),
    col('form', ['title', 'sub', 'name', 'email', 'role', 'size', 'updates', 'tip', 'actions']),
    text('title', 'Create your workspace', 'h1'),
    text('sub', 'It takes less than a minute. You can change everything later.', 'caption'),
    field('name', 'Full name', '/name', 'Ada Lovelace'),
    field('email', 'Work email', '/email', 'ada@company.com'),
    pick('role', 'Your role', '/role', [['eng', 'Engineering'], ['design', 'Design'], ['product', 'Product'], ['other', 'Something else']]),
    { id: 'size', component: 'Slider', label: 'Team size', min: 1, max: 50, value: P('/size') },
    check('updates', 'Send me product updates (about once a month)', '/updates'),
    { id: 'tip', component: 'Callout', tone: 'info', title: 'Invite your team later', text: 'After setup you get a link to share with teammates.' },
    row('actions', ['cancel', 'create']),
    ...btn('cancel', 'Cancel', 'cancel'),
    ...btn('create', 'Create workspace', 'create_workspace', { name: P('/name'), email: P('/email'), role: P('/role'), size: P('/size'), updates: P('/updates') }, true),
  ], { name: '', email: '', role: 'eng', size: 5, updates: false }, 'soft'),
})

// 4. pricing (accent, purple)
const plan = (id, name, price, per, blurb, features, cta, extra = {}) => [
  card(id, id + '_col', extra.highlight ? { highlight: true } : {}),
  col(id + '_col', [id + '_head', id + '_price', id + '_blurb', id + '_div', ...features.map((_, i) => `${id}_f${i}`), id + '_btn']),
  row(id + '_head', extra.badge ? [id + '_name', id + '_badge'] : [id + '_name']),
  text(id + '_name', name, 'h3'),
  ...(extra.badge ? [badge(id + '_badge', extra.badge, 'accent')] : []),
  text(id + '_price', `${price}${per}`, 'h2'),
  text(id + '_blurb', blurb, 'caption'),
  divider(id + '_div'),
  ...features.map((f, i) => text(`${id}_f${i}`, `✓  ${f}`)),
  ...btn(id + '_btn', cta, 'select_plan', { plan: id }, !!extra.highlight),
]
demos.push({
  skill: 'demo-pricing', fixture: 'pricing', title: 'three pricing plans',
  heading: 'Choose a plan', primary: 'pro_btn', surfaceId: 'pricing',
  messages: surface('pricing', [
    col('root', ['title', 'sub', 'plans']),
    text('title', 'Choose a plan', 'h1'),
    text('sub', 'Switch or cancel any time. Prices per user, billed monthly.', 'caption'),
    row('plans', ['free', 'pro', 'team'], { alignment: 'top' }),
    ...plan('free', 'Free', '$0', '', 'For trying things out', ['1 project', 'Community support', '7-day history'], 'Start free'),
    ...plan('pro', 'Pro', '$12', ' / mo', 'For individuals who ship', ['Unlimited projects', 'Priority support', '90-day history'], 'Choose Pro', { highlight: true, badge: 'Most popular' }),
    ...plan('team', 'Team', '$29', ' / mo', 'For teams that collaborate', ['Everything in Pro', 'SSO and audit log', 'Unlimited history'], 'Contact sales'),
  ], null, { name: 'accent', accent: 'purple' }),
})

// 5. dashboard (clean)
demos.push({
  skill: 'demo-dashboard', fixture: 'dashboard', title: 'a release health dashboard',
  heading: 'Release health', primary: 'report', surfaceId: 'health',
  messages: surface('health', [
    col('root', ['head', 'stats', 'progress', 'chart', 'warn', 'oncall', 'actions']),
    row('head', ['title', 'week'], { distribution: 'spaceBetween' }),
    text('title', 'Release health', 'h2'),
    badge('week', 'Week 48', 'neutral'),
    row('stats', ['s1', 's2', 's3']),
    { id: 's1', component: 'Stat', label: 'Deploys', value: '42', delta: '+12%' },
    { id: 's2', component: 'Stat', label: 'Failed deploys', value: '3', delta: '-40%', goodWhen: 'down' },
    { id: 's3', component: 'Stat', label: 'Lead time', value: '1.8 h', delta: '+0.3 h', goodWhen: 'down' },
    card('progress', 'progress_col'),
    col('progress_col', ['p1', 'p2']),
    { id: 'p1', component: 'Progress', label: 'Sprint 48', value: 17, max: 25, valueText: '17 / 25 points' },
    { id: 'p2', component: 'Progress', label: 'Test coverage', value: 82, max: 100, tone: 'success' },
    card('chart', 'bars'),
    { id: 'bars', component: 'BarChart', title: 'Pull requests merged', items: [{ label: 'web', value: 31 }, { label: 'api', value: 24 }, { label: 'mobile', value: 12 }, { label: 'infra', value: 7 }] },
    { id: 'warn', component: 'Callout', tone: 'warning', title: '2 services are on an old runtime', text: 'billing and search still run Node 18, which reaches end of life next month.' },
    row('oncall', ['oncall_t', 'a1', 'a2']),
    text('oncall_t', 'On call:', 'caption'),
    { id: 'a1', component: 'Avatar', name: 'Ada Lovelace', subtitle: 'Platform' },
    { id: 'a2', component: 'Avatar', name: 'Grace Hopper', subtitle: 'SRE' },
    row('actions', ['later', 'report']),
    ...btn('later', 'Remind me tomorrow', 'snooze'),
    ...btn('report', 'Open full report', 'open_report', { week: 48 }, true),
  ], null, 'clean'),
})

// 6. tasks (soft)
demos.push({
  skill: 'demo-tasks', fixture: 'tasks', title: 'a launch checklist',
  heading: 'Launch checklist', primary: 'save', surfaceId: 'checklist',
  messages: surface('checklist', [
    card('root', 'col'),
    col('col', ['head', 'progress', 'list', 'div', 'new', 'actions']),
    row('head', ['title', 'due'], { distribution: 'spaceBetween' }),
    text('title', 'Launch checklist', 'h2'),
    badge('due', 'Due Friday', 'warning'),
    { id: 'progress', component: 'Progress', label: 'Done', value: 2, max: 5, valueText: '2 of 5' },
    { id: 'list', component: 'List', children: { componentId: 'task', path: '/tasks' } },
    row('task', ['task_check', 'task_badge', 'task_owner']),
    { id: 'task_check', component: 'CheckBox', label: P('title'), value: P('done') },
    { id: 'task_badge', component: 'Badge', text: P('priority'), tone: 'neutral' },
    { id: 'task_owner', component: 'Text', text: P('owner'), variant: 'caption' },
    divider('div'),
    field('new', 'New task', '/newTask', 'Write release notes'),
    row('actions', ['add', 'save']),
    ...btn('add', 'Add task', 'add_task', { title: P('/newTask') }),
    ...btn('save', 'Save checklist', 'save_checklist', { tasks: P('/tasks') }, true),
  ], {
    newTask: '',
    tasks: [
      { title: 'Freeze the release branch', done: true, priority: 'high', owner: 'Ada' },
      { title: 'Run the load test', done: true, priority: 'high', owner: 'Grace' },
      { title: 'Update the changelog', done: false, priority: 'medium', owner: 'Linus' },
      { title: 'Prepare the announcement', done: false, priority: 'medium', owner: 'Margaret' },
      { title: 'Schedule the rollout', done: false, priority: 'low', owner: 'Ada' },
    ],
  }, 'soft'),
})

// 7. settings with tabs (clean)
demos.push({
  skill: 'demo-settings', fixture: 'settings', title: 'project settings with tabs',
  heading: 'Project settings', primary: 'save', surfaceId: 'settings',
  messages: surface('settings', [
    col('root', ['title', 'card']),
    text('title', 'Project settings', 'h2'),
    card('card', 'col'),
    col('col', ['tabs', 'actions']),
    { id: 'tabs', component: 'Tabs', tabs: [{ title: 'General', child: 'general' }, { title: 'Notifications', child: 'notify' }, { title: 'Advanced', child: 'advanced' }] },
    col('general', ['g_name', 'g_branch', 'g_format']),
    field('g_name', 'Project name', '/name'),
    pick('g_branch', 'Default branch', '/branch', [['main', 'main'], ['develop', 'develop'], ['trunk', 'trunk']]),
    check('g_format', 'Format code on save', '/format'),
    col('notify', ['n_email', 'n_slack', 'n_digest']),
    check('n_email', 'Email me when a build fails', '/email'),
    check('n_slack', 'Post deploys to Slack', '/slack'),
    pick('n_digest', 'Summary email', '/digest', [['daily', 'Daily'], ['weekly', 'Weekly'], ['never', 'Never']]),
    col('advanced', ['a_jobs', 'a_hook', 'a_warn']),
    { id: 'a_jobs', component: 'Slider', label: 'Parallel jobs', min: 1, max: 16, value: P('/jobs') },
    field('a_hook', 'Webhook URL', '/hook', 'https://example.com/hooks/build'),
    { id: 'a_warn', component: 'Callout', tone: 'warning', text: 'More parallel jobs finish faster but use more build minutes.' },
    row('actions', ['reset', 'save']),
    ...btn('reset', 'Reset', 'reset_settings'),
    ...btn('save', 'Save settings', 'save_settings', { settings: P('/') }, true),
  ], { name: 'checkout-api', branch: 'main', format: true, email: true, slack: false, digest: 'weekly', jobs: 4, hook: '' }, 'clean'),
})

// 8. dangerous action confirmation (accent, red)
demos.push({
  skill: 'demo-confirm', fixture: 'confirm', title: 'a confirmation for a destructive action',
  heading: 'Delete 3 preview environments?', primary: 'delete', surfaceId: 'confirm-delete',
  messages: surface('confirm-delete', [
    card('root', 'col'),
    col('col', ['title', 'warn', 'details', 'ack', 'typed', 'actions']),
    text('title', 'Delete 3 preview environments?', 'h2'),
    { id: 'warn', component: 'Callout', tone: 'error', title: "This can't be undone", text: 'The environments, their databases and their logs will be removed.' },
    { id: 'details', component: 'KeyValue', items: [
      { label: 'Project', value: 'checkout-api' },
      { label: 'Environments', value: 'pr-812, pr-815, pr-820' },
      { label: 'Created by', value: 'Ada Lovelace' },
      { label: 'Storage freed', value: '14.2 GB' },
    ] },
    check('ack', 'I understand that this deletes data permanently', '/ack'),
    field('typed', 'Type the project name', '/typed', 'checkout-api'),
    row('actions', ['cancel', 'delete'], { distribution: 'end' }),
    ...btn('cancel', 'Keep them', 'cancel'),
    ...btn('delete', 'Delete environments', 'delete_environments', { ack: P('/ack'), typed: P('/typed') }, true),
  ], { ack: false, typed: '' }, { name: 'accent', primaryColor: '#c83246' }),
})

// 9. carousel: triage issues (choices, back/forward, Done) + browse names (loop, per-card button)
demos.push({
  skill: 'demo-swipe', fixture: 'swipe', title: 'card carousels: issue triage and name ideas',
  heading: 'Triage new issues', primary: 'stack:submit', surfaceId: 'triage',
  messages: [
    ...surface('triage', [
      col('root', ['title', 'sub', 'stack']),
      text('title', 'Triage new issues', 'h2'),
      text('sub', 'Go through the cards with Back and Next. Pick an action for each; you can go back and change it.', 'caption'),
      { id: 'stack', component: 'Carousel', title: 'Inbox', children: { componentId: 'issue', path: '/issues' }, itemKey: 'ref',
        choices: [{ label: 'Skip', value: 'skip' }, { label: 'Later', value: 'later' }, { label: 'Fix now', value: 'fix', primary: true }],
        decisions: P('/triage'), action: { event: { name: 'triage' } }, actionLabel: 'Send triage' },
      col('issue', ['i_head', 'i_title', 'i_body', 'i_meta']),
      row('i_head', ['i_type', 'i_ref']),
      { id: 'i_type', component: 'Badge', text: P('type'), tone: 'info' },
      { id: 'i_ref', component: 'Text', text: P('ref'), variant: 'caption' },
      { id: 'i_title', component: 'Text', text: P('title'), variant: 'h3' },
      { id: 'i_body', component: 'Text', text: P('body') },
      { id: 'i_meta', component: 'KeyValue', items: [{ label: 'Opened by', value: P('author') }, { label: 'Comments', value: P('comments') }, { label: 'Area', value: P('area') }] },
    ], {
      triage: {},
      issues: [
        { ref: '#812', type: 'bug', title: 'Checkout button does nothing on Safari', body: 'Clicking “Pay now” on Safari 18 shows no error and never submits. Chrome and Firefox work.', author: 'mkowalski', comments: 7, area: 'web' },
        { ref: '#815', type: 'bug', title: 'Search returns duplicates after reindex', body: 'Since Tuesday’s reindex, each product appears twice in search results.', author: 'jnovak', comments: 3, area: 'search' },
        { ref: '#817', type: 'feature', title: 'Export orders as CSV', body: 'Finance asks for a monthly CSV export of orders with tax breakdown.', author: 'finance-bot', comments: 1, area: 'api' },
        { ref: '#820', type: 'bug', title: 'Dark mode: unreadable error toasts', body: 'Red text on dark red background in error toasts; contrast ratio is about 2:1.', author: 'adesign', comments: 4, area: 'web' },
        { ref: '#821', type: 'chore', title: 'Upgrade billing service to Node 22', body: 'Node 18 reaches end of life next month. billing still pins 18.', author: 'platform', comments: 0, area: 'infra' },
        { ref: '#824', type: 'feature', title: 'Remember last used payment method', body: 'Returning customers want their last card preselected at checkout.', author: 'pm-lena', comments: 12, area: 'web' },
        { ref: '#826', type: 'bug', title: 'Flaky test: OrdersApi.refunds', body: 'Fails about 1 in 20 runs on CI with a timeout talking to the payment mock.', author: 'ci', comments: 2, area: 'api' },
        { ref: '#829', type: 'question', title: 'Is the v1 webhook format still supported?', body: 'A partner still sends v1 payloads. Do we accept them until the end of the year?', author: 'partner-success', comments: 5, area: 'api' },
      ],
    }, 'soft'),
    ...surface('names', [
      col('root', ['title', 'deck']),
      text('title', 'Name ideas for the new CLI', 'h3'),
      { id: 'deck', component: 'Carousel', loop: true, children: { componentId: 'idea', path: '/ideas' } },
      col('idea', ['n_name', 'n_why', 'n_use']),
      { id: 'n_name', component: 'Text', text: P('name'), variant: 'h1' },
      { id: 'n_why', component: 'Text', text: P('why') },
      ...btn('n_use', 'Use this name', 'pick_name', { name: P('name') }, true),
    ], {
      ideas: [
        { name: 'shipit', why: 'Short, verb-first, says what it does.' },
        { name: 'relay', why: 'Hands work from one stage to the next.' },
        { name: 'tern', why: 'A small, fast seabird. Easy to type.' },
        { name: 'forge', why: 'Builds things; feels solid.' },
      ],
    }, { name: 'accent', accent: 'purple' }),
  ],
})

// ---- write files ----
const jsonl = (msgs) => msgs.map((m) => JSON.stringify(m)).join('\n')
const tests = []
for (const d of demos) {
  const body = jsonl(d.messages)
  const fallback = buildSurfaces(d.messages).map((x) => surfaceToMarkdown(x)).join('\n\n---\n\n')
  mkdirSync(join(root, 'fixtures'), { recursive: true })
  writeFileSync(join(root, 'fixtures', d.fixture + '.jsonl'), body + '\n')
  const skillDir = join(root, 'skills', d.skill)
  mkdirSync(skillDir, { recursive: true })
  writeFileSync(join(skillDir, 'SKILL.md'), `---
name: ${d.skill}
description: Show a fixed A2UI demo surface (${d.title}) drawn by the a2ui-render mod. Use only when the user runs /a2ui-render:${d.skill} or asks for this demo.
disable-model-invocation: true
---

<!-- Generated by scripts/build-demos.mjs. Edit that file, not this one. -->

Reply with exactly the text below and nothing else: no introduction, no explanation, no tool calls. Copy every character unchanged: the fallback between the \`<!-- a2ui:fallback -->\` markers (shown only in apps that can't draw the form, such as the mobile apps), then the \`<!-- a2ui\` … \`-->\` block with the form.

When the user then presses a button, you'll get an "A2UI action event" message. Answer it in one or two sentences, saying which button was pressed and which values arrived. Don't act on it: this is only a demo.

\`\`\`\`
<!-- a2ui:fallback -->
${fallback}
<!-- /a2ui:fallback -->

<!-- a2ui
${body}
-->
\`\`\`\`
`)
  tests.push({ name: d.skill, body, fallback, heading: d.heading, primary: d.primary, surfaceId: d.surfaceId })
}
writeFileSync(join(root, 'tests', 'demos.generated.ts'),
  '// Generated by scripts/build-demos.mjs. Do not edit.\n' +
  'export const demos = ' + JSON.stringify(tests, null, 2) + ' as const\n')
console.log('wrote', demos.length, 'demos')
