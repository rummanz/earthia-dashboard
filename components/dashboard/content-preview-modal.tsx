'use client'
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown'
import { Button } from '@/components/ui/button'
import { useSettingsStore } from '@/lib/store'
import { StatusBadge } from '@/components/shared/status-badge'
import { ScoreBar } from '@/components/shared/score-bar'
import { SocialIconRow } from '@/components/shared/social-icon'
import { api, type TaskLogDTO } from '@/lib/api'
import type { ContentItem } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import {
  Image as ImageIcon,
  Play,
  MoreVertical,
  Copy,
  Trash2,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface Props {
  item: ContentItem | null
  onClose: () => void
  onDelete?: (id: string) => void
}

export function ContentPreviewModal({ item, onClose, onDelete }: Props) {
  const threshold = useSettingsStore((s) => s.settings.reviewThreshold)

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl">
        <div className="flex items-start justify-between gap-3 pr-8">
          <DialogTitle>{item?.templateName ?? 'Content'}</DialogTitle>
          {item && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="More actions">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem
                  onClick={() => onDelete?.(item.id)}
                  className="text-[var(--danger)]"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-2" />
                  Delete task
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
        {item && (
          <Tabs defaultValue="overview" className="mt-3">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="logs">Logs</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-4 outline-none">
              <OverviewPanel item={item} threshold={threshold} />
            </TabsContent>

            <TabsContent value="logs" className="mt-4 outline-none">
              <LogsPanel taskId={item.id} />
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}

function OverviewPanel({
  item,
  threshold,
}: {
  item: ContentItem
  threshold: number
}) {
  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="rounded-md border border-[var(--border)] bg-[var(--background)] aspect-square flex items-center justify-center overflow-hidden">
        {item.mediaUrl ? (
          <div className="relative w-full h-full">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.mediaUrl} alt="" className="w-full h-full object-cover" />
            {(item.contentType === 'video' || item.contentType === 'reel') && (
              <Play
                className="absolute inset-0 m-auto h-12 w-12 text-white drop-shadow"
                fill="currentColor"
              />
            )}
          </div>
        ) : (
          <div className="text-center text-[var(--muted)]">
            <ImageIcon className="h-12 w-12 mx-auto mb-2" />
            <p className="text-xs">No media yet</p>
          </div>
        )}
      </div>

      <div className="space-y-4">
        <Section label="Status">
          <div className="flex items-center gap-2">
            <StatusBadge status={item.status} />
            <ScoreBar
              score={item.reviewScore}
              inProgress={item.status === 'reviewing'}
              threshold={threshold}
            />
          </div>
        </Section>

        <Section label="Generated Prompt">
          <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs whitespace-pre-wrap text-[var(--foreground)] max-h-32 overflow-auto">
            {item.generatedPrompt}
          </div>
        </Section>

        <Section label="Metadata">
          <div className="grid grid-cols-2 gap-2 text-xs">
            <Meta k="Type" v={item.contentType} />
            <Meta
              k="Dimensions"
              v={`${item.dimensions.width}×${item.dimensions.height}`}
            />
            <Meta k="Schedule" v={item.schedule.type} />
            <Meta k="Created" v={formatDate(item.createdAt, 'long')} />
            {item.scheduledAt && (
              <Meta k="Scheduled" v={formatDate(item.scheduledAt, 'long')} />
            )}
            {item.publishedAt && (
              <Meta k="Published" v={formatDate(item.publishedAt, 'long')} />
            )}
          </div>
        </Section>

        {item.reviewNotes && (
          <Section label="Reviewer Notes">
            <p className="text-sm text-[var(--muted)] italic">{item.reviewNotes}</p>
          </Section>
        )}

        <Section label="Timeline">
          <ol className="space-y-1 text-xs font-mono">
            <TimelineEvent label="Generated" done={!!item.mediaUrl} />
            <TimelineEvent
              label="Reviewed"
              done={item.reviewScore !== undefined}
            />
            <TimelineEvent label="Published" done={item.status === 'published'} />
          </ol>
        </Section>

        {item.publishedPosts && item.publishedPosts.length > 0 && (
          <Section label="Live On">
            <SocialIconRow
              platforms={item.platforms}
              publishedPosts={item.publishedPosts}
            />
          </Section>
        )}
      </div>
    </div>
  )
}

// Logs polled every 2s; SSE also invalidates the query key.
function LogsPanel({ taskId }: { taskId: string }) {
  const { data: logs } = useQuery({
    queryKey: ['task-logs', taskId],
    queryFn: () => api.getTaskLogs(taskId, undefined, 1000),
    refetchInterval: 2000,
  })

  const sorted = useMemo(() => logs ?? [], [logs])

  if (!logs) {
    return <p className="text-xs text-[var(--muted)]">Loading logs…</p>
  }
  if (sorted.length === 0) {
    return (
      <p className="text-xs text-[var(--muted)] py-4">
        No logs yet — task hasn&apos;t started executing.
      </p>
    )
  }
  return (
    <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
      {sorted.map((log) => (
        <LogEntry key={log.id} log={log} />
      ))}
    </div>
  )
}

const DIRECTION_GLYPH: Record<string, string> = {
  request: '→',
  response: '←',
  info: 'ⓘ',
  error: '✕',
}

function LogEntry({ log }: { log: TaskLogDTO }) {
  const [copied, setCopied] = useState(false)
  useEffect(() => {
    if (!copied) return
    const t = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(t)
  }, [copied])

  const isError = log.direction === 'error'
  return (
    <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3">
      <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-wider mb-2">
        <span className="px-1.5 py-0.5 rounded bg-[var(--surface)] border border-[var(--border)] text-[var(--foreground)]">
          {log.step}
        </span>
        <span className={cn(isError ? 'text-[var(--danger)]' : 'text-[var(--muted)]')}>
          {DIRECTION_GLYPH[log.direction] ?? log.direction} {log.direction}
        </span>
        <span className="text-[var(--muted)]">{formatDate(log.created_at, 'long')}</span>
        {log.http_status !== null && (
          <span
            className={cn(
              'ml-auto px-1.5 py-0.5 rounded',
              log.http_status >= 400
                ? 'bg-[var(--danger)]/15 text-[var(--danger)]'
                : 'bg-[var(--surface)] text-[var(--muted)]'
            )}
          >
            {log.http_status}
          </span>
        )}
        {log.duration_ms !== null && (
          <span className="text-[var(--muted)]">{log.duration_ms}ms</span>
        )}
        <button
          className="ml-auto p-1 text-[var(--muted)] hover:text-[var(--foreground)]"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(log.payload)
              setCopied(true)
            } catch {
              // ignore
            }
          }}
          title="Copy payload"
        >
          <Copy className="h-3 w-3" />
        </button>
        {copied && (
          <span className="text-[var(--accent)] text-[10px]">copied!</span>
        )}
      </div>
      <pre className="font-mono text-[11px] leading-relaxed whitespace-pre-wrap break-words max-h-60 overflow-auto text-[var(--foreground)]">
        {log.payload}
      </pre>
    </div>
  )
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="section-label mb-2">{label}</div>
      {children}
    </div>
  )
}

function Meta({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between border-b border-[var(--border)] py-1">
      <span className="text-[var(--muted)] uppercase text-[10px] tracking-wider font-mono">{k}</span>
      <span className="font-mono">{v}</span>
    </div>
  )
}

function TimelineEvent({ label, done }: { label: string; done: boolean }) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={
          done
            ? 'h-2 w-2 rounded-full bg-[var(--accent)]'
            : 'h-2 w-2 rounded-full border border-[var(--border)]'
        }
      />
      <span className={done ? 'text-[var(--foreground)]' : 'text-[var(--muted)]'}>{label}</span>
    </li>
  )
}
