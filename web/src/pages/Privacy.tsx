import privacy from '../../../docs/privacy.md?raw'
import { Markdown } from './markdown'
import { PageShell } from './Static'

export default function Privacy() {
  return <PageShell title="Privacy"><Markdown source={privacy} /></PageShell>
}
