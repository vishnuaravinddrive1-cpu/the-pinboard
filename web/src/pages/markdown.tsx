import { config } from '../config'

function fill(s: string) {
  return s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => (config.operator as Record<string, string>)[k] ?? '')
}
function inline(s: string): React.ReactNode[] {
  return fill(s).split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i} className="font-semibold">{part.slice(2, -2)}</strong> : part)
}

/** Tiny renderer for the headings / paragraphs / lists used in docs/*.md. */
export function Markdown({ source }: { source: string }) {
  // The owner's private drafting notes ("delete before publishing") are never rendered on the public site.
  const lines = source.split(/\n## Notes for you/i)[0].split('\n')
  const out: React.ReactNode[] = []
  let list: string[] = []
  const flush = () => { if (list.length) { out.push(<ul key={out.length} className="list-disc pl-6 space-y-1 mb-3">{list.map((l, i) => <li key={i}>{inline(l)}</li>)}</ul>); list = [] } }
  lines.forEach((raw, i) => {
    const l = raw.trimEnd()
    if (/^[-*] /.test(l)) { list.push(l.slice(2)); return }
    flush()
    if (!l || /^(\*\*)?version:/i.test(l)) return
    if (/^---+$/.test(l)) { out.push(<hr key={i} className="my-4 border-brown/20" />); return }
    if (l.startsWith('# ')) return
    if (l.startsWith('### ')) out.push(<h3 key={i} className="text-lg font-semibold mt-4 mb-1">{inline(l.slice(4))}</h3>)
    else if (l.startsWith('## ')) out.push(<h2 key={i} className="text-xl font-bold mt-6 mb-2">{inline(l.slice(3))}</h2>)
    else if (l.startsWith('> ')) out.push(<p key={i} className="caption mb-3 border-l-4 border-terracotta pl-3">{inline(l.slice(2))}</p>)
    else out.push(<p key={i} className="mb-3 leading-relaxed">{inline(l)}</p>)
  })
  flush()
  return <div>{out}</div>
}
export function termsVersionOf(src: string): string {
  return /^version:\s*(.+)$/im.exec(src)?.[1].trim() ?? config.termsVersion
}
