import { addDays } from './dates'
import type { PublicPoster } from './types'

const compact = (d: string) => d.replace(/-/g, '')

export function googleCalendarUrl(p: PublicPoster): string {
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: p.title,
    dates: `${compact(p.event_date)}/${compact(addDays(p.event_date, 1))}`,
    location: `${p.area}, Chennai`,
    details: `Found on Pin Board. ${location.origin}/p/${p.id}`,
  })
  return `https://calendar.google.com/calendar/render?${params}`
}

const esc = (s: string) => s.replace(/[\\;,]/g, (c) => '\\' + c).replace(/\n/g, '\\n')

export function icsContent(p: PublicPoster): string {
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//TCQ//Pin Board//EN', 'BEGIN:VEVENT',
    `UID:${p.id}@pinboard`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${compact(p.event_date)}`, `DTEND;VALUE=DATE:${compact(addDays(p.event_date, 1))}`,
    `SUMMARY:${esc(p.title)}`, `LOCATION:${esc(p.area + ', Chennai')}`,
    `URL:${location.origin}/p/${p.id}`, 'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}

export function downloadIcs(p: PublicPoster) {
  const url = URL.createObjectURL(new Blob([icsContent(p)], { type: 'text/calendar' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${p.title.replace(/[^\w]+/g, '-').slice(0, 40) || 'event'}.ics`
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
