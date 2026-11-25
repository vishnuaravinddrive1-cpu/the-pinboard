/** How the poster will look pinned on the dark cork board. */
export default function PosterPreview({ src, title, date, ratio }: { src: string | null; title: string; date: string; ratio: number }) {
  return (
    <figure className="cork rounded-2xl p-6 sm:p-8 flex justify-center items-center min-h-[220px] overflow-hidden shadow-inner border-4 border-brown" aria-label="Preview on the board">
      {src ? (
        <div className="relative w-[min(64%,240px)]" style={{ transform: 'rotate(-2.5deg)' }}>
          <div className="rounded-[3px] overflow-hidden bg-cream shadow-[0_8px_16px_rgba(0,0,0,.6)]" style={{ aspectRatio: `${ratio}` }}>
            <img src={src} alt={title || 'Your poster'} className="w-full h-full object-cover block" />
          </div>
          <span className="pin" style={{ left: '50%' }} aria-hidden="true" />
          <figcaption className="absolute -bottom-6 inset-x-0 text-center text-xs text-peach truncate">{title || 'Event title'}{date ? ` · ${date}` : ''}</figcaption>
        </div>
      ) : <p className="text-peach text-sm text-center">Choose a poster to see how it will look on the board.</p>}
    </figure>
  )
}
