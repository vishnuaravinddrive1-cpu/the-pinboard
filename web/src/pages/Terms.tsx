import terms from '../../../docs/terms.md?raw'
import { config } from '../config'
import { Markdown } from './markdown'
import { PageShell } from './Static'

export default function Terms() {
  return (
    <PageShell title="Terms and Conditions">
      <p className="caption mb-4">Version {config.termsVersion}</p>
      <Markdown source={terms} />
    </PageShell>
  )
}
