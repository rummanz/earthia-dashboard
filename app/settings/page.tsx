import { loadAllAgents } from '@/lib/agents'
import { SettingsView } from '@/components/settings/settings-view'

export const dynamic = 'force-dynamic'

export default function SettingsPage() {
  const agents = loadAllAgents()
  return (
    <SettingsView
      agents={agents.map((a) => ({
        id: a.id,
        name: a.name,
        description: a.description,
        defaultModel: a.model,
      }))}
    />
  )
}
