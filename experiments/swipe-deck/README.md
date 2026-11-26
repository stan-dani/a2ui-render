# Experiment: drag-to-swipe cards

`swipe-deck.mjs` is a Claude Code surface module (drawn through a `Client` element) that lets a
Carousel's card be dragged: left for the next card, right to go back. The mod side used a
`ui.message` hook to answer the deck's `{type: 'go', delta}` posts with new props.

It shipped in a2ui-render 0.4.0–0.5.0 and was taken out in 0.5.1: with it in the plugin, the
Desktop app's Code tab stopped drawing every form (it showed Claude's raw reply). The likely
cause is that the app refused a plugin that ships a surface module or hooks `ui.message`.

The tests here ran against the plugin at 0.5.0 and won't run from this folder as is.
