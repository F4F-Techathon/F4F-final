// Files the library hands out: JSON and CSV of a character's assets, and PNG frame sheets.
import type { Figure } from '@/agents/rig'
import { snapshot, viewBox } from './faces.ts'
import type { Recipe } from './frames.ts'

export function download(name: string, data: Blob | string, type = 'application/json') {
  const blob = data instanceof Blob ? data : new Blob([data], { type })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 500)
}

// UTF-8 with a BOM so spreadsheet apps read the Chinese.
export function toCSV(rows: unknown[][]) {
  const cell = (value: unknown) => {
    const text = value == null ? '' : typeof value === 'object' ? JSON.stringify(value) : String(value)
    return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
  }
  return '﻿' + rows.map((row) => row.map(cell).join(',')).join('\n')
}

/** Every frame of an asset side by side (at most 10 a row), 160 px wide each. */
export async function frameSheet(figure: Figure, recipe: Recipe, name: string) {
  const urls = recipe.frames.map((frame) => snapshot(figure, frame.st, recipe.crop))
  const box = viewBox(figure, recipe.crop).split(' ').map(Number)
  const fw = 160, fh = Math.round((fw * box[3]!) / box[2]!), cols = Math.min(urls.length, 10), rows = Math.ceil(urls.length / cols)
  const canvas = document.createElement('canvas')
  canvas.width = cols * fw
  canvas.height = rows * fh
  const g = canvas.getContext('2d')!
  await Promise.all(urls.map((url, i) => new Promise<void>((resolve) => {
    const image = new Image()
    image.onload = () => { g.drawImage(image, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh); resolve() }
    image.onerror = () => resolve()
    image.src = url
  })))
  urls.forEach((url) => URL.revokeObjectURL(url))
  await new Promise<void>((resolve) => canvas.toBlob((blob) => { if (blob) download(`${name}_${urls.length}f.png`, blob); resolve() }))
}
