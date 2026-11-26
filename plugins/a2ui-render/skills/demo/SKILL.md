---
name: demo
description: Show a fixed A2UI demo surface (a deploy form) to check that the a2ui-render mod draws and sends actions. Use only when the user runs /a2ui-render:demo or asks for the A2UI demo.
disable-model-invocation: true
---

Reply with exactly the block below and nothing else: no introduction, no explanation, no tool calls. Copy every character unchanged, including the opening ```a2ui line and the closing ``` line.

When the user then presses a button, you'll get an "A2UI action event" message. Answer it in one or two sentences, saying which button was pressed and which values arrived. Don't deploy anything: this is only a demo.

````
```a2ui
{"version":"1.0","createSurface":{"surfaceId":"deploy","catalogId":"basic"}}
{"version":"1.0","updateComponents":{"surfaceId":"deploy","components":[{"id":"root","component":"Column","children":["title","card"]},{"id":"title","component":"Text","text":"Deploy request","variant":"h2"},{"id":"card","component":"Card","child":"form"},{"id":"form","component":"Column","children":["desc","info","div1","branch","env","notify","actions"]},{"id":"desc","component":"Text","text":"Review the release below and confirm the deployment."},{"id":"info","component":"Row","children":["svc","ver"]},{"id":"svc","component":"Text","text":"Service: checkout-api"},{"id":"ver","component":"Text","text":"Version: 2.4.1"},{"id":"div1","component":"Divider"},{"id":"branch","component":"TextField","label":"Branch","value":{"path":"/branch"}},{"id":"env","component":"ChoicePicker","label":"Environment","options":[{"label":"Staging","value":"staging"},{"label":"Production","value":"production"}],"value":{"path":"/env"}},{"id":"notify","component":"CheckBox","label":"Notify #deploys channel","value":{"path":"/notify"}},{"id":"actions","component":"Row","children":["cancel_btn","deploy_btn"]},{"id":"cancel_btn","component":"Button","child":"cancel_txt","action":{"event":{"name":"cancel"}}},{"id":"cancel_txt","component":"Text","text":"Cancel"},{"id":"deploy_btn","component":"Button","child":"deploy_txt","variant":"primary","action":{"event":{"name":"deploy","context":{"branch":{"path":"/branch"},"env":{"path":"/env"},"notify":{"path":"/notify"}}}}},{"id":"deploy_txt","component":"Text","text":"Deploy"}]}}
{"version":"1.0","updateDataModel":{"surfaceId":"deploy","path":"/","value":{"branch":"main","env":"staging","notify":true}}}
```
````
