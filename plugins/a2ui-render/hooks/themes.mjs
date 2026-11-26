// themes — how A2UI components look in Claude Code.
//
// Colors are Claude Code theme keys where possible (they adapt to light and dark mode).
// Tints use rgba() so they work on both light and dark backgrounds. SVG fills use hex,
// because an SVG is drawn as an image and can't read the app's theme.

export const THEMES = ['clean', 'soft', 'accent']

export const ACCENTS = {
  orange: { key: 'claude', rgb: [217, 119, 87] },
  blue: { key: 'permission', rgb: [87, 105, 247] },
  green: { key: 'success', rgb: [44, 150, 70] },
  purple: { key: 'merged', rgb: [124, 92, 255] },
  teal: { key: 'planMode', rgb: [0, 140, 140] },
}

export const TONES = {
  neutral: { key: 'inactive', rgb: [128, 128, 128], icon: '•' },
  info: { key: 'permission', rgb: [87, 105, 247], icon: 'ℹ' },
  success: { key: 'success', rgb: [44, 150, 70], icon: '✓' },
  warning: { key: 'warning', rgb: [200, 140, 30], icon: '⚠' },
  error: { key: 'error', rgb: [200, 50, 70], icon: '✕' },
}

const hex = ([r, g, b]) => '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
const rgba = ([r, g, b], a) => `rgba(${r},${g},${b},${a})`

function parseHex(s) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(s ?? '').trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

// Pick the theme for one surface: createSurface.theme wins, then the plugin settings.
// createSurface.theme may be "soft", or {"name": "accent", "accent": "blue"}, or
// A2UI's own {"primaryColor": "#00bfff"}.
export function resolveTheme(surfaceTheme, options = {}, surface = 'desktop') {
  const st = typeof surfaceTheme === 'string' ? { name: surfaceTheme } : (surfaceTheme && typeof surfaceTheme === 'object' ? surfaceTheme : {})
  const name = THEMES.includes(st.name) ? st.name : THEMES.includes(options.theme) ? options.theme : 'clean'
  let accent = ACCENTS[st.accent] ?? ACCENTS[options.accent] ?? ACCENTS.orange
  const custom = parseHex(st.primaryColor)
  if (custom) accent = { key: hex(custom), rgb: custom }
  return makeTheme(name, accent, surface)
}

export function makeTheme(name, accent, surface) {
  const desktop = surface !== 'terminal'
  const tone = (t) => (t === 'accent' ? { ...accent, icon: '★' } : TONES[t] ?? TONES.neutral)

  const t = {
    name,
    desktop,
    accent,
    tone,
    hex,
    rgba,
    labelsAbove: name === 'soft',
    rowGap: name === 'soft' ? 'md' : 'sm',

    card(extra = {}) {
      if (name === 'soft') {
        return desktop
          ? { backgroundColor: rgba([128, 128, 128], 0.07), paddingX: 'lg', paddingY: 'md', rowGap: 'md', ...extra }
          : { borderStyle: 'round', borderDimColor: true, paddingX: 'md', paddingY: 'sm', ...extra }
      }
      if (name === 'accent') return { borderStyle: 'round', borderColor: accent.key, paddingX: 'md', paddingY: 'sm', ...extra }
      return { borderStyle: 'round', borderDimColor: true, paddingX: 'md', paddingY: 'sm', ...extra }
    },

    // Props for a Text at a heading level (1–5), or {} for body text.
    heading(level) {
      const size = level === 1 ? 'title' : level <= 3 ? 'heading' : undefined
      const base = { bold: true, weight: 'semibold', ...(size ? { size } : {}) }
      if (name === 'accent' && level <= 2) return { ...base, color: accent.key }
      return base
    },

    label() {
      return name === 'soft' ? { size: 'footnote', weight: 'medium', dimColor: true } : { dimColor: true }
    },

    // A small pill. Tinted background in the app; colored text in the terminal.
    badge(toneName) {
      const tn = tone(toneName)
      if (!desktop) return { color: tn.key, bold: true }
      if (name === 'accent' || toneName === 'accent') return { backgroundColor: tn.key, color: 'inverseText', weight: 'medium', size: 'footnote' }
      return { backgroundColor: rgba(tn.rgb, 0.16), color: tn.key, weight: 'medium', size: 'footnote' }
    },

    callout(toneName) {
      const tn = tone(toneName)
      return desktop
        ? { backgroundColor: rgba(tn.rgb, name === 'clean' ? 0.08 : 0.12), paddingX: 'md', paddingY: 'sm', flexDirection: 'row', columnGap: 'sm' }
        : { borderStyle: 'round', borderColor: tn.key, paddingX: 'sm', flexDirection: 'row', columnGap: 'sm' }
    },

    tile() {
      if (name === 'soft' && desktop) return { backgroundColor: rgba([128, 128, 128], 0.07), paddingX: 'md', paddingY: 'sm', flexDirection: 'column', flexGrow: 1 }
      if (name === 'accent') return { borderStyle: 'round', borderColor: accent.key, paddingX: 'md', flexDirection: 'column', flexGrow: 1 }
      return { borderStyle: 'round', borderDimColor: true, paddingX: 'md', flexDirection: 'column', flexGrow: 1 }
    },

    // SVG bar from 0..1. Track is a neutral tint that reads on light and dark.
    barSvg(fraction, width, height, rgb = accent.rgb) {
      const f = Math.max(0, Math.min(1, Number(fraction) || 0))
      const w = Math.round(width), h = Math.round(height), r = Math.round(h / 2)
      const fill = Math.max(f > 0 ? h : 0, Math.round(w * f))
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
        `<rect width="${w}" height="${h}" rx="${r}" fill="${hex([128, 128, 128])}" fill-opacity="0.22"/>` +
        (fill > 0 ? `<rect width="${fill}" height="${h}" rx="${r}" fill="${hex(rgb)}"/>` : '') + '</svg>'
    },

    textBar(fraction, cells) {
      const f = Math.max(0, Math.min(1, Number(fraction) || 0))
      const n = Math.round(cells * f)
      return '█'.repeat(n) + '░'.repeat(Math.max(0, cells - n))
    },

    avatarSvg(initials, size = 32, rgb = accent.rgb) {
      const s = Math.round(size)
      const safe = String(initials).replace(/[^\p{L}\p{N}]/gu, '').slice(0, 2).toUpperCase() || '?'
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">` +
        `<circle cx="${s / 2}" cy="${s / 2}" r="${s / 2}" fill="${hex(rgb)}"/>` +
        `<text x="50%" y="50%" dy="0.35em" text-anchor="middle" font-family="-apple-system, Segoe UI, sans-serif" font-size="${Math.round(s * 0.4)}" font-weight="600" fill="#ffffff">${safe}</text></svg>`
    },
  }
  return t
}

export function initialsOf(name) {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean)
  if (!parts.length) return '?'
  return ((parts[0][0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] ?? '' : '')).toUpperCase()
}
