/** Browser-side image pipeline: sniff type by content, PDF page 1 -> image, resize, strip metadata, WebP. */
export type Kind = 'jpeg' | 'png' | 'webp' | 'pdf'

export async function sniff(file: Blob): Promise<Kind | null> {
  const b = new Uint8Array(await file.slice(0, 16).arrayBuffer())
  const ascii = (a: number, n: number) => String.fromCharCode(...b.slice(a, a + n))
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg'
  if (b[0] === 0x89 && ascii(1, 3) === 'PNG') return 'png'
  if (ascii(0, 4) === 'RIFF' && ascii(8, 4) === 'WEBP') return 'webp'
  if (ascii(0, 5) === '%PDF-') return 'pdf'
  return null
}

async function pdfToCanvas(file: Blob, longEdge: number): Promise<HTMLCanvasElement> {
  const pdfjs = await import('pdfjs-dist')
  const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
  pdfjs.GlobalWorkerOptions.workerSrc = worker
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const page = await doc.getPage(1)
  const base = page.getViewport({ scale: 1 })
  const scale = longEdge / Math.max(base.width, base.height)
  const vp = page.getViewport({ scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(vp.width); canvas.height = Math.round(vp.height)
  const ctx = canvas.getContext('2d')!
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
  await page.render({ canvasContext: ctx, viewport: vp, canvas }).promise
  void page.cleanup()
  return canvas
}

function toBlob(c: HTMLCanvasElement, q: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Could not encode image.'))), 'image/webp', q))
}
function scaled(src: CanvasImageSource, sw: number, sh: number, longEdge: number): HTMLCanvasElement {
  const k = Math.min(1, longEdge / Math.max(sw, sh))
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(sw * k)); c.height = Math.max(1, Math.round(sh * k))
  const ctx = c.getContext('2d')!
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(src, 0, 0, c.width, c.height) // redrawing on a canvas drops EXIF/ICC metadata
  return c
}
async function encodeUnder(c: HTMLCanvasElement, maxBytes: number, start: number): Promise<Blob> {
  let q = start, blob = await toBlob(c, q)
  while (blob.size > maxBytes && q > 0.3) { q -= 0.1; blob = await toBlob(c, q) }
  let cur = c
  while (blob.size > maxBytes && cur.width > 500) { // still too big: shrink dimensions
    cur = scaled(cur, cur.width, cur.height, cur.width * 0.85); blob = await toBlob(cur, 0.6)
  }
  return blob
}

export interface Processed { full: Blob; thumb: Blob; width: number; height: number; previewUrl: string; wasPdf: boolean }

export async function processPoster(file: File): Promise<Processed> {
  const kind = await sniff(file)
  if (!kind) throw new Error('That file is not a JPG, PNG, WebP or PDF.')
  let src: HTMLCanvasElement | ImageBitmap
  let w: number, h: number
  if (kind === 'pdf') {
    try { src = await pdfToCanvas(file, 1600) } catch { throw new Error('Could not read that PDF. Try exporting it as an image.') }
    w = src.width; h = src.height
  } else {
    try { src = await createImageBitmap(file, { imageOrientation: 'from-image' }) } catch { throw new Error('Could not read that image. Try another file.') }
    w = src.width; h = src.height
  }
  const fullCanvas = scaled(src, w, h, 1600)
  const thumbCanvas = scaled(fullCanvas, fullCanvas.width, fullCanvas.height, 420)
  const [full, thumb] = [await encodeUnder(fullCanvas, 400 * 1024, 0.85), await encodeUnder(thumbCanvas, 60 * 1024, 0.75)]
  if ('close' in src) src.close()
  return { full, thumb, width: fullCanvas.width, height: fullCanvas.height, previewUrl: URL.createObjectURL(thumb), wasPdf: kind === 'pdf' }
}
