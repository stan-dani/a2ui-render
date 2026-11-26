---
name: a2ui
description: Answer with an interactive A2UI surface (forms, choices, confirmations, cards, lists) that the a2ui-render mod draws as native UI in Claude Code. Use when the user has to pick between options, fill in several values, confirm an action, or when a result reads better as a card or list than as prose; also use when a message arrives that starts with "A2UI action event".
---

# Answering with A2UI

The `a2ui-render` mod turns an ```` ```a2ui ```` block in your reply into real controls: text, cards, rows, buttons, text fields, checkboxes and pickers. When the user presses a button, you receive its action and the current form values as a new message.

Use a surface when it saves the user typing: picking one of several options, filling in more than one value, confirming something risky, or seeing a structured result. Don't use one for a plain answer that reads fine as text.

## Format

Write normal Markdown around the block if it helps (one short sentence is usually enough). Put the UI in **one fenced block tagged `a2ui`**, with **one JSON message per line** (JSONL). No comments, no trailing commas.

**Always put a short fallback before the block**, between `<!-- a2ui:fallback -->` and `<!-- /a2ui:fallback -->`. The mod hides it where it draws the form; apps that can't draw (the Claude mobile apps, claude.ai) show it instead. Keep it to the essentials: the title, the current values or options as a short list, and what to reply, e.g. `*Reply with: “Deploy” or “Cancel”*`.

````
<!-- a2ui:fallback -->
**Deploy checkout-api 2.4.1?** Branch: main · Environment: Staging

*Reply with: “Deploy” or “Cancel”*
<!-- /a2ui:fallback -->

```a2ui
...
```
````

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

### Extra components (a2ui-render catalog)

These go beyond the A2UI basic catalog. Use them freely; other A2UI renderers may not know them.

| Component | Props |
|---|---|
| `Badge` | `text`, `tone`: `neutral`, `info`, `success`, `warning`, `error` or `accent` |
| `Callout` | `tone` (as Badge), optional `title`, `text` |
| `KeyValue` | `items`: `[{"label": "Project", "value": "checkout-api"}, ...]` |
| `Stat` | `label`, `value`, optional `delta` like `"+12%"` or `"-3"`, optional `goodWhen: "down"` when a fall is good |
| `Progress` | `label`, `value`, optional `max` (default 1, or 100 when value > 1), optional `valueText`, optional `tone` |
| `BarChart` | optional `title`, `items`: `[{"label": "web", "value": 31}, ...]` |
| `Avatar` | `name`, optional `subtitle` |
| `Spacer` | — (pushes the next items in a Row to the end) |
| `Carousel` | Cards shown one at a time with **‹ Back / Next ›** and position dots. `children`: ids or a template `{"componentId": "card", "path": "/items"}`. Optional: `title`, `loop: true`, `itemKey` (field that identifies an item, e.g. `"id"`), `choices: [{"label": "Skip", "value": "skip"}, {"label": "Keep", "value": "keep", "primary": true}]` (choosing records the decision and moves on; going back shows it and lets the user change it), `decisions` (bound path where decisions are stored, as `{itemKey: value}`), `action` + `actionLabel` (a Done button; its event context gets `decisions` automatically) |

Add `"swipe": true` to a `Carousel` to let the user drag cards with the mouse (left for the next card, right to go back) in the Desktop app; Back / Next buttons keep working. Card content in a swipe carousel should stick to Text, Badge, Row, Column, KeyValue and Divider, which the draggable card can draw.

Use a `Carousel` when the user should look at several similar items one by one: triaging issues or pull requests, reviewing suggestions, comparing options, browsing ideas. A Button inside a card template can read that card's fields with relative paths, e.g. `"context": {"name": {"path": "name"}}`.

Also:
- `Text` takes an optional `tone` for colored text.
- `Card` takes `"highlight": true` to draw it in the accent color (for a recommended option).
- `Row` takes `"distribution": "spaceBetween"`, `"center"` or `"end"`, and `"alignment": "top"`.

## Themes

The user picks a default look in the plugin settings: `clean` (neutral), `soft` (tinted cards, labels above fields) or `accent` (colored borders and headings). Leave the theme alone unless it helps. To set one for a surface, add it to `createSurface`:

```json
{"version":"1.0","createSurface":{"surfaceId":"plans","catalogId":"basic","theme":{"name":"accent","accent":"purple"}}}
```

`theme` may be a name (`"soft"`), `{"name": ..., "accent": "orange|blue|green|purple|teal"}`, or A2UI's `{"primaryColor": "#c83246"}` for a custom accent. Use red (`#c83246`) only for destructive confirmations.

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
