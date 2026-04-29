// Server-only scheduler. Polls for due tasks every TICK_MS and dispatches
// each one through the Coordinator gateway agent. Idempotent on hot reload.
import { listDueTasks } from '@/lib/db/repo'
import { dispatchTask } from '@/lib/dispatch'

interface SchedulerHandle {
  interval: NodeJS.Timeout
  startedAt: number
  tickCount: number
}

const globalAny = globalThis as unknown as {
  __ocScheduler?: SchedulerHandle
  __ocSchedulerInflight?: Set<string>
}

const TICK_MS = 10_000
const BATCH_SIZE = 5

function inflight(): Set<string> {
  if (!globalAny.__ocSchedulerInflight) {
    globalAny.__ocSchedulerInflight = new Set()
  }
  return globalAny.__ocSchedulerInflight
}

async function tick(): Promise<void> {
  const handle = globalAny.__ocScheduler
  if (!handle) return
  handle.tickCount++
  let due
  try {
    due = listDueTasks(BATCH_SIZE)
  } catch {
    return
  }
  for (const t of due) {
    if (inflight().has(t.id)) continue
    void dispatchTask(t.id).catch(() => {
      // dispatch already logs/persists failure
    })
  }
}

export function startScheduler(): void {
  if (globalAny.__ocScheduler) return
  const interval = setInterval(() => {
    void tick()
  }, TICK_MS)
  if (typeof interval.unref === 'function') interval.unref()
  globalAny.__ocScheduler = {
    interval,
    startedAt: Date.now(),
    tickCount: 0,
  }
  setTimeout(() => {
    void tick()
  }, 250)
}

export function getSchedulerStatus(): {
  running: boolean
  startedAt: number | null
  tickCount: number
  inFlight: number
} {
  const h = globalAny.__ocScheduler
  if (!h) return { running: false, startedAt: null, tickCount: 0, inFlight: 0 }
  return {
    running: true,
    startedAt: h.startedAt,
    tickCount: h.tickCount,
    inFlight: inflight().size,
  }
}
