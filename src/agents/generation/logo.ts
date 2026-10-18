// A shop's logo, ready for the generator (ported from agent-studio/web/js/agentgen.js): downscaled
// to a 96 px PNG for the host's chest badge, with its main chromatic colors counted on a canvas
// (no vision model). Pass the result as ShopInfo.logo and ShopInfo.colors.
import type { ShopColor } from './shop.ts'

const SIZE = 96

function loadImage(source: Blob | string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    const url = typeof source === 'string' ? source : URL.createObjectURL(source)
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('图片读不出来'))
    image.crossOrigin = 'anonymous'
    image.src = url
  })
}

// `cover` fills the square (a shop's cover photo cropped for the round badge) and comes back as a small JPEG, so a
// photo costs a few KB in the stored host and in the console's copy instead of a PNG's tens.
export async function processLogo(source: Blob | string | CanvasImageSource, { cover = false } = {}): Promise<{ data: string; colors: ShopColor[] }> {
  const image = typeof source === 'string' || source instanceof Blob ? await loadImage(source) : source
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = SIZE
  const context = canvas.getContext('2d')!
  const width = (image as HTMLImageElement).naturalWidth || (image as { width: number }).width
  const height = (image as HTMLImageElement).naturalHeight || (image as { height: number }).height
  const k = cover ? Math.max(SIZE / width, SIZE / height) : Math.min(SIZE / width, SIZE / height)
  context.drawImage(image, (SIZE - width * k) / 2, (SIZE - height * k) / 2, width * k, height * k)
  const pixels = context.getImageData(0, 0, SIZE, SIZE).data
  const bins = new Map<number, { n: number; r: number; g: number; b: number }>()
  let opaque = 0
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i]!, g = pixels[i + 1]!, b = pixels[i + 2]!, a = pixels[i + 3]!
    if (a < 200) continue
    opaque++
    const max = Math.max(r, g, b), min = Math.min(r, g, b)
    if (max - min < 34 || max < 40 || min > 228) continue // greys, near-black and near-white say little
    const key = (r >> 5) * 64 + (g >> 5) * 8 + (b >> 5)
    const bin = bins.get(key) || { n: 0, r: 0, g: 0, b: 0 }
    bin.n++; bin.r += r; bin.g += g; bin.b += b
    bins.set(key, bin)
  }
  const hex = (bin: { n: number; r: number; g: number; b: number }) => '#' + [bin.r, bin.g, bin.b].map((v) => Math.round(v / bin.n).toString(16).padStart(2, '0')).join('').toUpperCase()
  const colors = [...bins.values()].sort((a, b) => b.n - a.n).filter((bin) => bin.n / Math.max(1, opaque) > .03).slice(0, 3)
    .map((bin) => ({ hex: hex(bin), share: +(bin.n / Math.max(1, opaque)).toFixed(3) }))
  return { data: cover ? canvas.toDataURL('image/jpeg', 0.82) : canvas.toDataURL('image/png'), colors }
}
