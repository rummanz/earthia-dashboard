import { loadAllAgents } from '@/lib/agents'
import { AgentsView } from '@/components/agents/agents-view'

export const dynamic = 'force-dynamic'

export default function AgentsPage() {
  const agents = loadAllAgents()
  return <AgentsView agents={agents} />
}
