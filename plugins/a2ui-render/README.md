# a2ui-render

Render [A2UI](https://github.com/a2ui-project/a2ui) surfaces as **native, interactive UI in Claude Code**: in the Code tab of the Claude Desktop app, and in the terminal.

When Claude's reply contains an ```` ```a2ui ```` block, this plugin draws it as real controls (text, cards, rows, text fields, checkboxes, pickers, buttons). When you press a button, the action and the form's current values go back to Claude, and Claude carries on.

> Unofficial. Not affiliated with or endorsed by the A2UI project or Google. "A2UI" refers to the open protocol this plugin implements.

## Install

You need Claude Code **v2.1.287 or later** in the terminal, or **v2.1.286 or later** in the Desktop app (check with `/status` in a local Code tab session). Plugins don't load in cloud or WSL sessions.

In a terminal:

```bash
claude plugin marketplace add stan-dani/a2ui-render
claude plugin install a2ui-render@a2ui-render
```

Or inside a Claude Code session:

```
/plugin marketplace add stan-dani/a2ui-render
/plugin install a2ui-render@a2ui-render
```

The plugin is installed for your user account, so the Desktop app's Code tab picks it up too. Start a new session, or run `/reload-plugins`. To manage it in the app, use **+ → Plugins → Manage plugins**.

## Try it

Each demo makes Claude reply with a fixed surface. Press a button and Claude gets the event with your values. Nothing is actually deployed, deleted or bought.

| Command | What it shows |
|---|---|
| `/a2ui-render:demo` | A deploy form (uses your default theme) |
| `/a2ui-render:demo-themes` | The same form in the **clean**, **soft** and **accent** themes, to compare |
| `/a2ui-render:demo-signup` | A sign-up form in the soft theme, with a slider and a callout |
| `/a2ui-render:demo-pricing` | Three plan cards side by side, with a highlighted "Most popular" plan |
| `/a2ui-render:demo-dashboard` | Stats with trends, progress bars, a bar chart, a warning, on-call avatars |
| `/a2ui-render:demo-tasks` | A checklist built from a data list, with priority badges |
| `/a2ui-render:demo-settings` | Settings split into tabs |
| `/a2ui-render:demo-confirm` | A confirmation for a destructive action, in red |
| `/a2ui-render:demo-swipe` | Card carousels: triage 8 issues by **dragging cards** left/right (or Back / Next), with choices you can revisit; and browse name ideas in a loop |

After that, just ask for things where a form helps, for example "help me set up a new project, ask me the details with a form". The `a2ui` skill tells Claude when and how to answer with a surface.

## What's in it

```
.claude-plugin/marketplace.json     marketplace listing this one plugin
plugins/a2ui-render/
├── .claude-plugin/plugin.json
├── hooks/hooks.json                points Claude Code at the mod
├── hooks/register.mjs              the mod: redraws messages that contain ```a2ui
├── hooks/a2ui-core.mjs             parser, data model, bindings (no Claude Code APIs)
├── hooks/themes.mjs                clean / soft / accent themes, colors, SVG bars
├── hooks/swipe-deck.mjs            draggable card deck (a Claude Code surface module)
├── hooks/plain.mjs                 a surface as plain Markdown (mobile, fallback text)
├── skills/a2ui/SKILL.md            teaches Claude the A2UI format and action handling
├── skills/demo*/SKILL.md           the demo commands (generated)
├── fixtures/*.jsonl                the demo surfaces (generated)
└── tests/                          run with `claude plugin test`
scripts/build-demos.mjs             source of all demos: `node scripts/build-demos.mjs`
```

The mod hooks the `AssistantMessage` render site, only for messages with an `a2ui` fence. The text around the block is drawn as Markdown, and the block is drawn as native elements. Claude and the transcript keep the original JSON; only the drawing changes. While the block is still streaming you see "Building UI…" in place of raw JSON.

## Where it shows

| App | What you see |
|---|---|
| Claude Desktop app, Code tab (local session) | The full interactive UI, including dragging cards |
| Claude Code in a terminal | The full UI with text-based bars; dragging needs fullscreen mode with mouse support |
| VS Code extension | The UI as far as the panel draws it, without dragging |
| Claude mobile apps, claude.ai, cloud sessions | Mods don't draw there. You see the **fallback text** Claude writes next to each form (the key facts and what to reply), followed by the raw JSON |

## Supported A2UI

Messages: `createSurface`, `updateComponents`, `updateDataModel`, `deleteSurface` (A2UI 1.0/0.9), plus the 0.8 names (`surfaceUpdate`, `dataModelUpdate`, `beginRendering`). The block may be JSONL, a JSON array or a single object.

| A2UI component | Drawn as |
|---|---|
| Text (`h1`–`h5`, `caption`) | Text, bold or dim |
| Column, List, Row | Box (column / row); list templates over a data array |
| Card, Modal | Bordered box |
| Divider | A line |
| Button with `event` action | Button; sends the action to Claude |
| TextField, DateTimeInput | Text field bound to the data model |
| CheckBox | Toggle button (☐ / ☑) |
| ChoicePicker, Slider | Picker |
| Tabs | A row of tab buttons |
| Image, Video, AudioPlayer | Link |
| Anything else | Its type name, with its children |

Extra components (this plugin's own catalog, beyond A2UI's basic one): **Badge**, **Callout**, **KeyValue**, **Stat**, **Progress**, **BarChart**, **Avatar**, **Spacer**, **Carousel** (cards one at a time with Back / Next, dots, optional per-card choices and a Done action; with `"swipe": true` the cards can be dragged). The `a2ui` skill documents their props for Claude.

Data bindings use `{"path": "/field"}` (JSON Pointer); paths inside a list template are relative to the item. Function calls such as `formatString` aren't evaluated. Button `functionCall` actions are ignored.

## Themes and settings

`/plugin configure a2ui-render@a2ui-render`, or `/config`:

- **Theme**: `clean` (default; neutral, follows the app), `soft` (borderless tinted cards, labels above fields, roomier) or `accent` (colored borders and headings).
- **Accent color**: `orange`, `blue`, `green`, `purple` or `teal`. Used by the accent theme, progress bars, charts and avatars.
- **Swipe gestures**: on (default). Lets carousels with `"swipe": true` be dragged with the mouse. Turn off if cards don't show; Back / Next always work.
- **Send button actions as**: `mod` (default), where Claude sees the action as coming from this plugin, or `user`, where it's sent as if you typed it.

A surface can override the theme in `createSurface`, e.g. `"theme": {"name": "accent", "accent": "purple"}` or A2UI's `"theme": {"primaryColor": "#c83246"}`.

Colors use Claude Code's theme colors, so they follow light and dark mode. In the Desktop app, progress bars, charts and avatars are drawn as SVG; in the terminal they fall back to text bars and initials.

## Develop

```bash
git clone https://github.com/stan-dani/a2ui-render
cd a2ui-render/plugins/a2ui-render
claude plugin validate .
claude plugin test
claude --plugin-dir .        # loads it for one session and reloads on save
```

To load your local copy in the Desktop app, set `CLAUDE_CODE_PLUGIN_DIRS` to the absolute path of `plugins/a2ui-render` in the `env` section of `~/.claude/settings.json`.

## Backlog

- Terminal polish: wider layouts, a pane mode for long surfaces
- More chart types (line, donut) and a Table component
- Swipe: velocity-based flicks, a slight tilt while dragging, vertical swipe for a third choice
- Bundle `@a2ui/web_core` for full spec coverage (functions, validation)
- Update an existing surface in place when Claude sends `updateComponents` for the same `surfaceId`

## License

MIT, see [LICENSE](LICENSE). A2UI itself is Apache-2.0; this plugin implements the protocol and contains no A2UI code.
