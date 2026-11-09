/** Browser-side download helpers. The file contents are built by the pure functions in engine/exporters. */

function save(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before the URL is released.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function downloadText(text: string, filename: string, type = 'text/csv;charset=utf-8') {
  // A byte-order mark lets spreadsheet programs detect UTF-8 (needed for β, γ, R₀ in labels).
  save(new Blob(['﻿', text], { type }), filename)
}

/**
 * Saves the first canvas inside `container` as a PNG, painted onto `background` (the network canvas is
 * transparent, so without it the image would have no backdrop). Resolves false if there is no canvas.
 */
export function downloadCanvasPNG(container: HTMLElement | null, filename: string, background: string): Promise<boolean> {
  const src = container?.querySelector('canvas')
  if (!src || !src.width || !src.height) return Promise.resolve(false)
  const out = document.createElement('canvas')
  out.width = src.width
  out.height = src.height
  const ctx = out.getContext('2d')
  if (!ctx) return Promise.resolve(false)
  ctx.fillStyle = background
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(src, 0, 0)
  return new Promise((resolve) =>
    out.toBlob((blob) => {
      if (!blob) return resolve(false)
      save(blob, filename)
      resolve(true)
    }, 'image/png'),
  )
}
