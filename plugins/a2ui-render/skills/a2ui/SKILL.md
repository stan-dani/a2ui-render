---
name: a2ui
description: Answer with an interactive A2UI surface (forms, choices, confirmations, cards, lists) that the a2ui-render mod draws as native UI in Claude Code. Use when the user has to pick between options, fill in several values, confirm an action, or when a result reads better as a card or list than as prose; also use when a message arrives that starts with "A2UI action event".
---

# Answering with A2UI

The `a2ui-render` mod turns an ```` ```a2ui ```` block in your reply into real controls: text, cards, rows, buttons, text fields, checkboxes and pickers. When the user presses a button, you receive its action and the current form values as a new message.

Use a surface when it saves the user typing: picking one of several options, filling in more than one value, confirming something risky, or seeing a structured result. Don't use one for a plain answer that reads fine as text.

## Format

Write normal Markdown around the block if it helps (one short sentence is usually enough). Put the UI in **one fenced block tagged `a2ui`**, with **one JSON message per line** (JSONL). No comments, no trailing commas.

````
```a2ui
{"version":"1.0","createSurface":{"surfaceId":"trip","catalogId":"basic"}}
{"version":"1.0","updateComponents":{"surfaceId":"trip","components":[ ...components... ]}}
{"version":"1.0","updateDataModel":{"surfaceId":"trip","path":"/","value":{ ...initial values... }}}
```
````

Rules:
- Use a **new `surfaceId`** for each surface you draw (for example `trip`, then `trip-2`), so earlier ones keep their state.
- Components are a **flat list**. Each has a unique `id` and a `component` type. Containers point to children by id. One component must have `"id": "root"`.
- Values can be literals, or bindings to the data model: `{"path": "/field"}`. Inputs (TextField, CheckBox, ChoicePicker, Slider, DateTimeInput) **must** bind `value` to a path, so the user's input ends up in the data model.
- Put initial values in `updateDataModel` with `"path": "/"`.
- A Button needs a `child` (the id of a Text that is its label) and an `action` such as `{"event": {"name": "submit", "context": {"email": {"path": "/email"}}}}`. Name events by intent: `submit`, `confirm`, `cancel`, `select_plan`.

## Components

| Component | Props |
|---|---|
| `Text` | `text`, `variant`: `h1`–`h5`, `body` or `caption` |
| `Column`, `List` | `children`: list of ids, or a template `{"componentId": "row_tpl", "path": "/items"}` that repeats `row_tpl` for each item; inside it, relative paths like `{"path": "name"}` read from that item |
| `Row` | `children` |
| `Card` | `child` |
| `Divider` | — |
| `Button` | `child`, `action`, optional `variant: "primary"` |
| `TextField` | `label`, `value` (bound), optional `placeholder` |
| `CheckBox` | `label`, `value` (bound boolean) |
| `ChoicePicker` | `label`, `options`: `[{"label": "Small", "value": "s"}, ...]`, `value` (bound) |
| `Slider` | `label`, `min`, `max`, `value` (bound number) |
| `DateTimeInput` | `label`, `value` (bound, `YYYY-MM-DD`) |
| `Tabs` | `tabs`: `[{"title": "One", "child": "tab1"}, ...]` |
| `Image` | `url`, `description` (shown as a link) |

Keep surfaces small: about 3–15 components. Nest at most a few levels.

## Example

````
```a2ui
{"version":"1.0","createSurface":{"surfaceId":"signup","catalogId":"basic"}}
{"version":"1.0","updateComponents":{"surfaceId":"signup","components":[{"id":"root","component":"Card","child":"col"},{"id":"col","component":"Column","children":["title","email","plan","terms","actions"]},{"id":"title","component":"Text","text":"Create your account","variant":"h2"},{"id":"email","component":"TextField","label":"Email","value":{"path":"/email"},"placeholder":"name@company.com"},{"id":"plan","component":"ChoicePicker","label":"Plan","options":[{"label":"Free","value":"free"},{"label":"Pro","value":"pro"}],"value":{"path":"/plan"}},{"id":"terms","component":"CheckBox","label":"I accept the terms","value":{"path":"/terms"}},{"id":"actions","component":"Row","children":["cancel","submit"]},{"id":"cancel","component":"Button","child":"cancel_t","action":{"event":{"name":"cancel"}}},{"id":"cancel_t","component":"Text","text":"Cancel"},{"id":"submit","component":"Button","child":"submit_t","variant":"primary","action":{"event":{"name":"submit","context":{"email":{"path":"/email"},"plan":{"path":"/plan"}}}}},{"id":"submit_t","component":"Text","text":"Create account"}]}}
{"version":"1.0","updateDataModel":{"surfaceId":"signup","path":"/","value":{"email":"","plan":"free","terms":false}}}
```
````

## When an action comes back

A message that starts with **"A2UI action event"** means the user pressed a button in one of your surfaces. It holds JSON with `surfaceId`, `name` (the event name), `context` (the values you asked for) and `dataModel` (every value in that surface).

- Treat it as the user's answer and carry on with the task. Don't repeat the values back at length.
- If something is missing or invalid (an empty required field, unaccepted terms), say so briefly and draw the surface again with a **new `surfaceId`**, keeping the values they already entered.
- On `cancel`, stop and ask what they'd like instead.
