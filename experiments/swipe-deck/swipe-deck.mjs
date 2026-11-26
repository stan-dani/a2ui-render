// swipe-deck — a Claude Code surface module (drawn through a `Client` element).
//
// Draws the current card of a Carousel on top of the next one, and lets the person
// drag it with the mouse: drag left past the threshold for the next card, right for the
// previous one; anything shorter springs back. Arrow keys do the same while it has focus.
//
// It holds only the drag and the animation. Which card is shown is the mod's: the deck
// posts {type: 'go', delta} and the mod answers with new props (a new index and cards).
//
// Props (plain data from the mod):
//   index, count            position, for resetting the drag when the card changes
//   cur, next, prev         cards as "lite trees" (see lite() below), prev/next may be null
//   canBack, canNext        whether a swipe that way is allowed
//   accent                  theme key or color for the drag hint and border
//   cardBg                  background of the top card, so the card under it is hidden

export default function SwipeDeck(props, surface) {
  const { Box, Text } = surface.elements
  const W = Math.max(24, Math.floor(surface.columns || props.width || 60))
  const H = Math.max(6, Math.floor(surface.rows || props.height || 12))
  const cardW = W - 2
  const cardH = H - 1
  const threshold = Math.max(4, cardW * 0.25)

  const fresh = () => ({ index: props.index, dx: 0, drag: null, anim: false, sent: false })
  const now = () => {
    const s = surface.state
    return s && s.index === props.index ? s : fresh()
  }
  const set = (patch) => surface.setState({ ...now(), ...patch })

  // Move dx toward `to` over ~180 ms, then call done. Respects reduced motion.
  const animate = (to, done) => {
    const from = now().dx
    if (surface.isMotionReduced || Math.abs(to - from) < 0.5) {
      set({ dx: to, anim: false })
      if (done) done()
      return
    }
    const steps = 9
    let i = 0
    set({ anim: true })
    const stop = surface.every(20, () => {
      i += 1
      const t = Math.min(1, i / steps)
      const eased = 1 - Math.pow(1 - t, 3)
      set({ dx: from + (to - from) * eased })
      if (t >= 1) {
        stop()
        set({ anim: false })
        if (done) done()
      }
    })
  }

  const go = (delta) => {
    const s = now()
    if (s.anim || s.sent) return
    if (delta > 0 && !props.canNext) return animate(0)
    if (delta < 0 && !props.canBack) return animate(0)
    // Next flies out to the left, back flies out to the right.
    animate(delta > 0 ? -W : W, () => {
      set({ sent: true })
      surface.post({ type: 'go', delta })
    })
  }

  surface.onPointer((p) => {
    const s = now()
    if (s.anim || s.sent || !p) return
    if (p.kind === 'down') return set({ drag: { col: p.col }, dx: 0 })
    if (p.kind === 'move' && s.drag) return set({ dx: p.col - s.drag.col })
    if (p.kind === 'up' && s.drag) {
      const dx = typeof p.col === 'number' ? p.col - s.drag.col : s.dx
      set({ drag: null, dx })
      if (dx <= -threshold) return go(1)
      if (dx >= threshold) return go(-1)
      return animate(0)
    }
  })

  surface.onKey((k) => {
    const name = String(k?.key ?? k?.name ?? k ?? '').toLowerCase()
    if (name === 'left' || name === 'arrowleft' || name === 'h') go(-1)
    else if (name === 'right' || name === 'arrowright' || name === 'l') go(1)
  })

  const s = now()
  const dx = Math.round(s.dx * 100) / 100
  const leaning = dx <= -1 ? 'next' : dx >= 1 ? 'back' : null
  const pastThreshold = Math.abs(dx) >= threshold
  const under = leaning === 'back' ? props.prev : props.next

  const children = []
  if (under) {
    children.push(Box({
      position: 'absolute', top: 1, left: 1, width: cardW, height: cardH,
      borderStyle: 'round', borderDimColor: true, paddingX: 1, overflow: 'hidden', flexDirection: 'column',
      children: [draw(under, Box, Text, true)],
    }))
  }
  children.push(Box({
    position: 'absolute', top: 0, left: dx, width: cardW, height: cardH,
    borderStyle: 'round', ...(pastThreshold ? { borderColor: props.accent || 'claude' } : { borderDimColor: true }),
    ...(props.cardBg ? { backgroundColor: props.cardBg } : {}),
    paddingX: 1, overflow: 'hidden', flexDirection: 'column',
    children: [props.cur ? draw(props.cur, Box, Text, false) : Text({ children: [''] })],
  }))
  if (leaning) {
    const label = leaning === 'next'
      ? (props.canNext ? 'Next ›' : 'Last card')
      : (props.canBack ? '‹ Back' : 'First card')
    children.push(Box({
      position: 'absolute', top: 0, ...(leaning === 'next' ? { right: 0 } : { left: 0 }),
      children: [Text({ bold: pastThreshold, ...(pastThreshold ? { color: props.accent || 'claude' } : { dimColor: true }), children: [` ${label} `] })],
    }))
  }
  return Box({ width: W, height: H, children })
}

// Draw a lite tree: {k:'col'|'row', c:[...]}, {k:'text', s, st}, {k:'badge', s, st},
// {k:'kv', items:[[label, value]]}, {k:'rule'}.
function draw(node, Box, Text, dim) {
  if (!node || typeof node !== 'object') return Text({ children: [''] })
  const style = (st) => ({ ...(st || {}), ...(dim ? { dimColor: true } : {}) })
  switch (node.k) {
    case 'text':
      return Text({ ...style(node.st), children: [String(node.s ?? '')] })
    case 'badge':
      return Box({ flexDirection: 'row', children: [Text({ ...style(node.st), children: [` ${node.s ?? ''} `] })] })
    case 'rule':
      return Text({ dimColor: true, children: ['─'.repeat(12)] })
    case 'kv':
      return Box({
        flexDirection: 'column',
        children: (node.items || []).map(([l, v]) => Box({
          flexDirection: 'row', columnGap: 1,
          children: [Text({ dimColor: true, children: [String(l) + ':'] }), Text({ ...style(), children: [String(v)] })],
        })),
      })
    case 'row':
      return Box({ flexDirection: 'row', columnGap: 2, children: (node.c || []).map((n) => draw(n, Box, Text, dim)) })
    default:
      return Box({ flexDirection: 'column', children: (node.c || []).map((n) => draw(n, Box, Text, dim)) })
  }
}
