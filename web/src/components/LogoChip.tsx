import { config } from '../config'

/** TCQ logo on a cream chip, linking to the TCQ site. The logo file is used as-is. */
export default function LogoChip({ className = '' }: { className?: string }) {
  return (
    <a
      href={config.tcqUrl}
      target="_blank"
      rel="noopener noreferrer"
      className={`inline-flex items-center justify-center rounded-xl bg-cream shadow-lg px-2.5 sm:px-3.5 min-h-[44px] min-w-[44px] ${className}`}
    >
      <img src="/tcq-logo.png" alt="The Curiosity Quotient" width={116} height={50} className="h-7 sm:h-9 w-auto" />
    </a>
  )
}
