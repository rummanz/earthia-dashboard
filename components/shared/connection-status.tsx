'use client'
import { useQuery } from '@tanstack/react-query'

interface StatusResponse {
  connected: boolean
  sessions_count: number
  gateway_url: string
  error?: string
}

async function fetchStatus(): Promise<StatusResponse> {
  const res = await fetch('/api/openclaw/status', { cache: 'no-store' })
  if (!res.ok) throw new Error(`status ${res.status}`)
  return (await res.json()) as StatusResponse
}

export function ConnectionStatus() {
  const { data, isLoading, isError, isFetching } = useQuery({
    queryKey: ['openclaw-status'],
    queryFn: fetchStatus,
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    retry: 1,
  })

  const connected = data?.connected === true
  const url = data?.gateway_url || 'gateway'

  let dotClass = 'bg-[var(--warning)]'
  let label = 'Connecting'
  const title: string | undefined = data?.error
  if (isError) {
    dotClass = 'bg-[var(--danger)]'
    label = 'Disconnected'
  } else if (connected) {
    dotClass = 'bg-[var(--success)]'
    label = 'Connected'
  } else if (data && !connected) {
    dotClass = 'bg-[var(--danger)]'
    label = 'Disconnected'
  } else if (isLoading || isFetching) {
    dotClass = 'bg-[var(--warning)]'
    label = 'Connecting'
  }

  return (
    <div
      className="flex flex-col gap-1 text-xs font-mono"
      title={title || url}
    >
      <div className="flex items-center gap-2 uppercase tracking-wider text-[var(--muted)]">
        <span
          className={`inline-block h-2 w-2 rounded-full ${dotClass} ${
            !connected ? 'animate-pulse-dot' : ''
          }`}
        />
        <span className="text-[var(--foreground)]">{label}</span>
      </div>
      <div className="text-[10px] text-[var(--muted)] truncate">{url}</div>
    </div>
  )
}
