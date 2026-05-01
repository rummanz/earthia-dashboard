'use client'
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useUIStore, useSettingsStore } from '@/lib/store'
import { taskToContentItem } from '@/lib/task-mapper'
import type { ContentItem, ContentStatus, SocialPlatform } from '@/lib/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { ScoreBar } from '@/components/shared/score-bar'
import { SocialIconRow, SocialIcon } from '@/components/shared/social-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate, isFuture } from '@/lib/utils'
import { Plus, Play, Image as ImageIcon, Layers, Trash2, RotateCcw } from 'lucide-react'
import { ContentPreviewModal } from './content-preview-modal'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'

const ALL_STATUSES: ContentStatus[] = [
  'queued', 'generating', 'reviewing', 'approved', 'rejected', 'published', 'failed',
]

const ALL_PLATFORMS: SocialPlatform[] = [
  'instagram', 'tiktok', 'youtube', 'twitter', 'linkedin', 'facebook', 'pinterest',
]

export function FeedTable() {
  const setAddOpen = useUIStore((s) => s.setAddContentOpen)
  const threshold = useSettingsStore((s) => s.settings.reviewThreshold)

  // Source of truth: /api/tasks. SSE invalidates this key on backend events.
  const { data: tasks } = useQuery({
    queryKey: ['tasks'],
    queryFn: () => api.listTasks(),
    refetchInterval: 15_000,
  })

  const items: ContentItem[] = useMemo(
    () => (tasks ? tasks.map(taskToContentItem) : []),
    [tasks]
  )

  const [statusFilter, setStatusFilter] = useState<ContentStatus[]>([])
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'status'>('date')
  const [previewItem, setPreviewItem] = useState<ContentItem | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const qc = useQueryClient()
  const deleteMut = useMutation({
    mutationFn: (id: string) => api.deleteTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
    },
  })
  const retryMut = useMutation({
    mutationFn: (id: string) => api.retryTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      qc.invalidateQueries({ queryKey: ['task-logs'] })
    },
  })

  const filtered = useMemo(() => {
    let list = items
    if (statusFilter.length > 0) list = list.filter((i) => statusFilter.includes(i.status))
    if (platformFilter.length > 0)
      list = list.filter((i) => i.platforms.some((p) => platformFilter.includes(p)))
    if (search) {
      const s = search.toLowerCase()
      list = list.filter((i) => i.templateName.toLowerCase().includes(s))
    }
    const sorted = [...list].sort((a, b) => {
      if (sortBy === 'score') return (b.reviewScore ?? -1) - (a.reviewScore ?? -1)
      if (sortBy === 'status') return a.status.localeCompare(b.status)
      const ad = a.scheduledAt || a.createdAt
      const bd = b.scheduledAt || b.createdAt
      return new Date(bd).getTime() - new Date(ad).getTime()
    })
    return sorted
  }, [items, statusFilter, platformFilter, search, sortBy])

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-mono text-xl uppercase tracking-wider">Dashboard</h1>
          <p className="text-xs text-[var(--muted)] mt-1">
            {filtered.length} of {items.length} content items
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)}>
          <Plus className="h-4 w-4" />
          Add Content
        </Button>
      </div>

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 p-3 rounded-md border border-[var(--border)] bg-[var(--surface)]">
        <Input
          placeholder="Search by template name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-xs"
        />

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm">
              Status {statusFilter.length > 0 && `(${statusFilter.length})`}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56">
            <div className="space-y-1">
              {ALL_STATUSES.map((s) => (
                <label key={s} className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="checkbox"
                    checked={statusFilter.includes(s)}
                    onChange={(e) =>
                      setStatusFilter((cur) =>
                        e.target.checked ? [...cur, s] : cur.filter((x) => x !== s)
                      )
                    }
                  />
                  <span className="font-mono uppercase text-xs">{s}</span>
                </label>
              ))}
            </div>
          </PopoverContent>
        </Popover>

        <div className="flex items-center gap-1 border border-[var(--border)] rounded-md p-1">
          {ALL_PLATFORMS.map((p) => {
            const active = platformFilter.includes(p)
            return (
              <button
                key={p}
                onClick={() =>
                  setPlatformFilter((cur) =>
                    cur.includes(p) ? cur.filter((x) => x !== p) : [...cur, p]
                  )
                }
                className={cn(
                  'p-1.5 rounded',
                  active ? 'bg-[var(--accent)]/15 text-[var(--accent)]' : 'text-[var(--muted)]'
                )}
                title={p}
              >
                <SocialIcon platform={p} className="h-3.5 w-3.5" />
              </button>
            )
          })}
        </div>

        <select
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value as 'date' | 'score' | 'status')}
          className="h-8 rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 text-xs font-mono uppercase"
        >
          <option value="date">Sort: Date</option>
          <option value="score">Sort: Score</option>
          <option value="status">Sort: Status</option>
        </select>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <div className="rounded-md border border-[var(--border)] bg-[var(--surface)] p-12 text-center">
          <ImageIcon className="h-10 w-10 mx-auto text-[var(--muted)] mb-3" />
          <p className="text-[var(--muted)] mb-4">No content yet. Add your first piece.</p>
          <Button onClick={() => setAddOpen(true)}>
            <Plus className="h-4 w-4" />
            Add Content
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-[var(--border)] overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface)]">
                <th className="text-left px-4 py-2 section-label w-12">#</th>
                <th className="text-left px-4 py-2 section-label">Date</th>
                <th className="text-left px-4 py-2 section-label hidden md:table-cell">Template</th>
                <th className="text-left px-4 py-2 section-label">Content</th>
                <th className="text-left px-4 py-2 section-label hidden lg:table-cell">Score</th>
                <th className="text-left px-4 py-2 section-label">Status</th>
                <th className="text-left px-4 py-2 section-label hidden md:table-cell">Published</th>
                <th className="text-left px-4 py-2 section-label w-12">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <FeedRow
                  key={item.id}
                  item={item}
                  index={idx + 1}
                  threshold={threshold}
                  onClick={() => setPreviewItem(item)}
                  onDelete={() => setDeleteId(item.id)}
                  onRetry={() => retryMut.mutate(item.id)}
                  isRetrying={retryMut.isPending}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ContentPreviewModal
        item={previewItem}
        onClose={() => setPreviewItem(null)}
        onDelete={(id) => {
          setPreviewItem(null)
          setDeleteId(id)
        }}
      />

      <Dialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <DialogContent className="max-w-md">
          <DialogTitle>Delete this task?</DialogTitle>
          <p className="text-sm text-[var(--muted)] mt-2">
            This will remove the row, its logs, activities, and any local media files. This
            cannot be undone.
          </p>
          <div className="flex justify-end gap-2 mt-6">
            <Button variant="outline" onClick={() => setDeleteId(null)} disabled={deleteMut.isPending}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                if (!deleteId) return
                deleteMut.mutate(deleteId, {
                  onSettled: () => setDeleteId(null),
                })
              }}
              disabled={deleteMut.isPending}
            >
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function FeedRow({
  item,
  index,
  threshold,
  onClick,
  onDelete,
  onRetry,
  isRetrying,
}: {
  item: ContentItem
  index: number
  threshold: number
  onClick: () => void
  onDelete: () => void
  onRetry: () => void
  isRetrying: boolean
}) {
  const dateStr = item.scheduledAt || item.publishedAt || item.createdAt
  const isUpcoming = isFuture(dateStr)
  const rejected = item.status === 'rejected'
  const published = item.status === 'published'

  return (
    <tr
      onClick={onClick}
      className={cn(
        'group border-b border-[var(--border)] hover:bg-[var(--surface)] cursor-pointer transition-colors',
        rejected && 'border-l-2 border-l-[var(--danger)]',
        published && 'border-l-2 border-l-[var(--accent)]',
        (item.status === 'generating' || item.status === 'reviewing') && 'animate-pulse-dot'
      )}
    >
      <td className="px-4 py-3 font-mono text-xs text-[var(--muted)]">
        {String(index).padStart(3, '0')}
      </td>
      <td className={cn('px-4 py-3 font-mono text-xs', isUpcoming && 'text-[var(--muted)]')}>
        {formatDate(dateStr)}
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <Badge variant="outline">{item.templateName}</Badge>
      </td>
      <td className="px-4 py-3">
        <ContentThumb item={item} />
      </td>
      <td className="px-4 py-3 hidden lg:table-cell">
        <ScoreBar
          score={item.reviewScore}
          inProgress={item.status === 'reviewing'}
          threshold={threshold}
        />
      </td>
      <td className="px-4 py-3">
        <StatusBadge status={item.status} />
      </td>
      <td className="px-4 py-3 hidden md:table-cell">
        <SocialIconRow platforms={item.platforms} publishedPosts={item.publishedPosts} />
      </td>
      <td className="px-4 py-3 text-right">
        <div className="inline-flex items-center gap-1">
          {item.status === 'failed' && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                onRetry()
              }}
              disabled={isRetrying}
              className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity p-1.5 rounded text-[var(--muted)] hover:text-[var(--accent)] hover:bg-[var(--background)] disabled:opacity-50"
              title="Retry failed stage"
              aria-label="Retry failed task"
            >
              <RotateCcw className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete()
            }}
            className="opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity p-1.5 rounded text-[var(--muted)] hover:text-[var(--danger)] hover:bg-[var(--background)]"
            title="Delete task"
            aria-label="Delete task"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </td>
    </tr>
  )
}

function ContentThumb({ item }: { item: ContentItem }) {
  if (!item.thumbnailUrl) {
    return (
      <div className="h-10 w-10 rounded-md border border-[var(--border)] bg-[var(--background)] flex items-center justify-center">
        <ImageIcon className="h-4 w-4 text-[var(--muted)]" />
      </div>
    )
  }
  return (
    <div className="relative h-10 w-10">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={item.thumbnailUrl}
        alt=""
        className="h-10 w-10 object-cover rounded-md border border-[var(--border)]"
      />
      {(item.contentType === 'video' || item.contentType === 'reel') && (
        <Play className="h-4 w-4 absolute inset-0 m-auto text-white drop-shadow" fill="currentColor" />
      )}
      {item.contentType === 'carousel' && (
        <Layers className="h-3 w-3 absolute -bottom-1 -right-1 text-[var(--accent)] bg-[var(--background)] rounded-full p-0.5" />
      )}
    </div>
  )
}
