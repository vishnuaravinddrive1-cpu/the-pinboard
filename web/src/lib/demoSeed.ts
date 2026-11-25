import { addDays, istToday } from './dates'
import type { Poster, Profile, PosterStatus } from './types'

const palettes: [string, string, string][] = [
  ['#F9F2E3', '#312122', '#CC8463'], ['#1f3a5f', '#f4e9cd', '#f2a541'], ['#2d6a4f', '#fefae0', '#ffb703'],
  ['#9B5033', '#F9F2E3', '#E3BBA3'], ['#5b2a86', '#fff1e6', '#ff9f1c'], ['#0b132b', '#f1faee', '#e63946'],
  ['#e9c46a', '#264653', '#e76f51'], ['#264653', '#e9f5db', '#f4a261'], ['#ffe5d9', '#6d213c', '#d1495b'],
  ['#14213d', '#fca311', '#ffffff'],
]
const sizes: [number, number][] = [[600, 800], [800, 800], [640, 800], [800, 450], [600, 900], [450, 800], [700, 990], [800, 1000]]

const titles: [string, string, string][] = [
  ['Filter Coffee & Poetry Evening', 'Arts', 'Mylapore'], ['Chennai Sketch Walk', 'Arts', 'Egmore'],
  ['Tamil Short Film Screening', 'Arts', 'Alwarpet'], ['Intro to Urban Birding', 'Experience', 'Adyar'],
  ['Open Mic: Stories from the City', 'Social', 'T. Nagar'], ['Climate & Coast Talk', 'Knowledge', 'Besant Nagar'],
  ['Board Games Meetup', 'Social', 'Anna Nagar'], ['Classical Music Sabha Night', 'Arts', 'Mylapore'],
  ['Pottery for Beginners', 'Experience', 'ECR'], ['Public Policy Reading Circle', 'Discussion', 'Nungambakkam'],
  ['Heritage Walk: George Town', 'Experience', 'Parrys'], ['Data Storytelling Workshop', 'Knowledge', 'Guindy'],
  ['Book Swap Sunday', 'Social', 'Velachery'], ['Theatre: A Midsummer Night', 'Arts', 'Kodambakkam'],
  ['Philosophy Cafe', 'Discussion', 'West Mambalam'], ['Street Photography Meet', 'Arts', 'Royapettah'],
  ['Neutral Civic Q&A: Water Supply', 'Discussion', 'Kilpauk'], ['Stargazing Night', 'Experience', 'OMR'],
  ['Language Exchange Evening', 'Social', 'Thiruvanmiyur'], ['Science Café: Brains & Beats', 'Knowledge', 'Tambaram'],
  ['Workshop (Other)', 'Other', 'Other'], ['Folk Art Fair', 'Arts', 'Porur'],
]

function esc(s: string) { return s.replace(/&/g, '&amp;').replace(/</g, '&lt;') }

function wrap(text: string, max: number): string[] {
  const out: string[] = []; let line = ''
  for (const w of text.split(' ')) {
    if ((line + ' ' + w).trim().length > max) { out.push(line); line = w } else line = (line + ' ' + w).trim()
  }
  if (line) out.push(line)
  return out
}

export function posterSvg(title: string, i: number, w: number, h: number, dateLabel: string): string {
  const [bg, fg, ac] = palettes[i % palettes.length]
  const size = Math.round(Math.min(w, h) * 0.105)
  const lines = wrap(title.toUpperCase(), Math.max(10, Math.round(w / (size * 0.62))))
  const t = lines.map((l, k) => `<text x="${w * 0.08}" y="${h * 0.3 + k * size * 1.15}" font-size="${size}" font-weight="800" fill="${fg}">${esc(l)}</text>`).join('')
  const shape = i % 3 === 0
    ? `<circle cx="${w * 0.78}" cy="${h * 0.78}" r="${Math.min(w, h) * 0.28}" fill="${ac}"/>`
    : i % 3 === 1 ? `<rect x="${w * 0.5}" y="${h * 0.6}" width="${w * 0.5}" height="${h * 0.4}" fill="${ac}"/>`
    : `<polygon points="0,${h} ${w * 0.7},${h} ${w},${h * 0.55} 0,${h * 0.8}" fill="${ac}"/>`
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Helvetica,Arial,sans-serif">
<rect width="${w}" height="${h}" fill="${bg}"/>${shape}
<rect x="${w * 0.08}" y="${h * 0.08}" width="${w * 0.2}" height="6" fill="${ac}"/>${t}
<text x="${w * 0.08}" y="${h * 0.9}" font-size="${size * 0.55}" font-weight="700" fill="${fg}">${esc(dateLabel)}</text></svg>`
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg)
}

export function seedPosters(): { posters: Poster[]; profiles: Profile[] } {
  const today = istToday()
  const now = new Date().toISOString()
  const profiles: Profile[] = [
    { id: 'u-admin', email: 'admin@demo.test', display_name: 'TCQ Admin', role: 'admin', status: 'approved', terms_version: null, terms_accepted_at: now, created_at: now },
    { id: 'u-org', email: 'organiser@demo.test', display_name: 'Demo Organiser', role: 'organiser', status: 'approved', terms_version: '2026-11-01', terms_accepted_at: now, created_at: now },
    { id: 'u-new', email: 'newbie@demo.test', display_name: 'New Organiser', role: 'organiser', status: 'pending', terms_version: '2026-11-01', terms_accepted_at: now, created_at: now },
    { id: 'u-sus', email: 'suspended@demo.test', display_name: 'Suspended Person', role: 'organiser', status: 'suspended', terms_version: '2026-11-01', terms_accepted_at: now, created_at: now },
  ]
  const posters: Poster[] = titles.map(([title, category, area], i) => {
    const [w, h] = sizes[i % sizes.length]
    const date = addDays(today, i === 0 ? 0 : 1 + i * 2)
    const img = posterSvg(title, i, w, h, date)
    const status: PosterStatus = 'live'
    return {
      id: `demo-${String(i + 1).padStart(3, '0')}`, title, event_date: date,
      booking_url: i % 4 === 3 ? null : `https://example.com/book/${i + 1}`,
      area, category, image_url: img, thumb_url: img, width: w, height: h, status,
      views: 20 + i * 7, clicks: 3 + i * 2, organiser_id: 'u-org', organiser_name: 'Demo Organiser',
      organiser_email: 'organiser@demo.test', created_at: new Date(Date.now() - i * 3600e3).toISOString(),
    }
  })
  return { posters, profiles }
}
