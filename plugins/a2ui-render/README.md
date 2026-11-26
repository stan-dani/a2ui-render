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

```
/a2ui-render:demo
```

Claude replies with a fixed deploy form. Change the branch, pick an environment, untick the checkbox and press **Deploy**. Claude gets the event with your values and answers. The demo doesn't deploy anything.

After that, just ask for things where a form helps, for example "help me set up a new project, ask me the details with a form". The `a2ui` skill tells Claude when and how to answer with a surface.

## What's in it

```
.claude-plugin/marketplace.json     marketplace listing this one plugin
plugins/a2ui-render/
├── .claude-plugin/plugin.json
├── hooks/hooks.json                points Claude Code at the mod
├── hooks/register.mjs              the mod: redraws messages that contain ```a2ui
├── hooks/a2ui-core.mjs             parser, data model, bindings (no Claude Code APIs)
├── skills/a2ui/SKILL.md            teaches Claude the A2UI format and action handling
├── skills/demo/SKILL.md            /a2ui-render:demo
├── fixtures/demo.jsonl             the demo surface
└── tests/render.test.ts            run with `claude plugin test`
```

The mod hooks the `AssistantMessage` render site, only for messages with an `a2ui` fence. The text around the block is drawn as Markdown, and the block is drawn as native elements. Claude and the transcript keep the original JSON; only the drawing changes. While the block is still streaming you see "Building UI…" in place of raw JSON.

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

Data bindings use `{"path": "/field"}` (JSON Pointer); paths inside a list template are relative to the item. Function calls such as `formatString` aren't evaluated. Button `functionCall` actions are ignored.

## Settings

`/plugin configure a2ui-render@a2ui-render`, or `/config`:

- **Send button actions as**: `mod` (default), where Claude sees the action as coming from this plugin, or `user`, where it's sent as if you typed it.

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
- Bundle `@a2ui/web_core` for full spec coverage (functions, validation)
- Update an existing surface in place when Claude sends `updateComponents` for the same `surfaceId`

## License

MIT, see [LICENSE](LICENSE). A2UI itself is Apache-2.0; this plugin implements the protocol and contains no A2UI code.
