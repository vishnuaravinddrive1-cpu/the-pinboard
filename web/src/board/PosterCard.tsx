import { memo } from 'react'
import type { Placed } from '../lib/layout'
import type { PublicPoster } from '../lib/types'

interface Props {
  p: PublicPoster
  pos: Placed
  near: boolean
  raised: boolean
  index: number
  onOpen: (id: string, el: HTMLElement) => void
  onFocusPoster: (id: string | null) => void
}

function PosterCard({ p, pos, near, raised, index, onOpen, onFocusPoster }: Props) {
  const transform = raised
    ? `translate3d(${pos.x}px, ${pos.y - 8}px, 0) rotate(${pos.rot * 0.3}deg) scale(1.06)`
    : `translate3d(${pos.x}px, ${pos.y}px, 0) rotate(${pos.rot}deg)`
  return (
    <div
      role="button" tabIndex={0} data-pid={p.id} data-testid="poster" aria-label={`${p.title}, ${p.event_date}`}
      className={`poster ${raised ? 'raised' : ''} ${near ? '' : 'skeleton'}`}
      style={{ width: pos.w, height: pos.h, transform, zIndex: pos.z, left: 0, top: 0 }}
      onClick={(e) => onOpen(p.id, e.currentTarget)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(p.id, e.currentTarget) } }}
      onFocus={() => onFocusPoster(p.id)} onBlur={() => onFocusPoster(null)}
    >
      <div className="sheet">
        {near && (
          <img src={p.thumb_url} alt={p.title} width={p.width} height={p.height} draggable={false}
            loading={index < 6 ? 'eager' : 'lazy'} fetchPriority={index < 2 ? 'high' : 'auto'} decoding="async" className="w-full h-full object-cover block" />
        )}
      </div>
      {index % 5 === 2
        ? <span className="tape" style={{ left: `calc(${pos.pinX * 100}% - 32px)`, transform: `rotate(${(pos.rot * 3).toFixed(1)}deg)` }} aria-hidden="true" />
        : <span className={`pin ${index % 2 ? 'alt' : ''}`} style={{ left: `${pos.pinX * 100}%` }} aria-hidden="true" />}
    </div>
  )
}
export default memo(PosterCard)
