// Colors for generated hosts, ported from agent-studio/server/agents.py. Rounding follows
// Python's round-half-even so a generated look stays identical to the original generator.

export interface NamedColor { id: string; hex: string; zh: string }

export const PALETTE: NamedColor[] = [
  { id: 'red', hex: '#C9483E', zh: '中国红' }, { id: 'orange', hex: '#D9822B', zh: '橙' }, { id: 'turmeric', hex: '#D8A93B', zh: '姜黄' },
  { id: 'olive', hex: '#6B8E3A', zh: '橄榄绿' }, { id: 'jade', hex: '#2F6E62', zh: '玉石绿' }, { id: 'lake', hex: '#2F7DD1', zh: '湖蓝' },
  { id: 'navy', hex: '#2D3E6B', zh: '藏青' }, { id: 'plum', hex: '#7A5A9E', zh: '梅子紫' }, { id: 'coffee', hex: '#8B5A3C', zh: '咖啡' },
  { id: 'rose', hex: '#C2185B', zh: '玫红' }, { id: 'ink', hex: '#3A3540', zh: '墨黑' },
]

// Names for any color a logo brings, beyond the palette a host can be dressed in.
const NAMED: NamedColor[] = [
  ...PALETTE,
  { id: 'white', hex: '#F4F1EA', zh: '白' }, { id: 'black', hex: '#1A1A1A', zh: '黑' }, { id: 'grey', hex: '#8A8A8A', zh: '灰' },
  { id: 'gold', hex: '#C9A44C', zh: '金' }, { id: 'green', hex: '#3E9B4F', zh: '绿' }, { id: 'blue', hex: '#1F5FBF', zh: '蓝' },
  { id: 'pink', hex: '#E58BA6', zh: '粉' },
]

export function roundHalfEven(value: number) {
  const floor = Math.floor(value), rest = value - floor
  if (rest !== .5) return Math.round(value)
  return floor % 2 === 0 ? floor : floor + 1
}

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace('#', '').slice(0, 6), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function toHex(r: number, g: number, b: number) {
  return '#' + [r, g, b].map((v) => Math.max(0, Math.min(255, roundHalfEven(v))).toString(16).toUpperCase().padStart(2, '0')).join('')
}

export function luma(hex: string) {
  const [r, g, b] = rgb(hex)
  return (.299 * r + .587 * g + .114 * b) / 255
}

// Negative k darkens towards black, positive k lightens towards white.
export function shade(hex: string, k: number) {
  const [r, g, b] = rgb(hex)
  return k < 0 ? toHex(r * (1 + k), g * (1 + k), b * (1 + k)) : toHex(r + (255 - r) * k, g + (255 - g) * k, b + (255 - b) * k)
}

// The nearest named color; the first one wins a tie, as Python's min() does.
export function colorName(hex: string) {
  const [r, g, b] = rgb(hex)
  let best = NAMED[0]!, bestDistance = Infinity
  for (const color of NAMED) {
    const [cr, cg, cb] = rgb(color.hex)
    const distance = (cr - r) ** 2 + (cg - g) ** 2 + (cb - b) ** 2
    if (distance < bestDistance) { best = color; bestDistance = distance }
  }
  return best.zh
}

// Identity color for dark UI: the theme lifted until it reads on near-black.
export function edge(theme: string) {
  let color = theme
  for (let step = 0; step < 4 && luma(color) < .42; step++) color = shade(color, .28)
  return luma(color) > .82 ? shade(color, -.12) : color
}
