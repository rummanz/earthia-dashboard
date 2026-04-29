'use client'
import { useMemo, useState } from 'react'
import { useContentStore, useUIStore, useSettingsStore } from '@/lib/store'
import type { ContentItem, ContentStatus, SocialPlatform } from '@/lib/types'
import { StatusBadge } from '@/components/shared/status-badge'
import { ScoreBar } from '@/components/shared/score-bar'
import { SocialIconRow, SocialIcon } from '@/components/shared/social-icon'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { cn, formatDate, isFuture } from '@/lib/utils'
import { Plus, Play, Image as ImageIcon, Layers } from 'lucide-react'
import { ContentPreviewModal } from './content-preview-modal'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'

const ALL_STATUSES: ContentStatus[] = [
  'queued', 'generating', 'reviewing', 'approved', 'rejected', 'published', 'failed',
]

const ALL_PLATFORMS: SocialPlatform[] = [
  'instagram', 'tiktok', 'youtube', 'twitter', 'linkedin', 'facebook', 'pinterest',
]

export function FeedTable() {
  const items = useContentStore((s) => s.items)
  const setAddOpen = useUIStore((s) => s.setAddContentOpen)
  const threshold = useSettingsStore((s) => s.settings.reviewThreshold)
  const [statusFilter, setStatusFilter] = useState<ContentStatus[]>([])
  const [platformFilter, setPlatformFilter] = useState<SocialPlatform[]>([])
  const [search, setSearch] = useState('')
  const [sortBy, setSortBy] = useState<'date' | 'score' | 'status'>('date')
  const [previewId, setPreviewId] = useState<string | null>(null)

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
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <FeedRow
                  key={item.id}
                  item={item}
                  index={idx + 1}
                  threshold={threshold}
                  onClick={() => setPreviewId(item.id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <ContentPreviewModal id={previewId} onClose={() => setPreviewId(null)} />
    </div>
  )
}

function FeedRow({
  item,
  index,
  threshold,
  onClick,
}: {
  item: ContentItem
  index: number
  threshold: number
  onClick: () => void
}) {
  const dateStr = item.scheduledAt || item.publishedAt || item.createdAt
  const isUpcoming = isFuture(dateStr)
  const rejected = item.status === 'rejected'
  const published = item.status === 'published'

  return (
    <tr
      onClick={onClick}
      className={cn(
        'border-b border-[var(--border)] hover:bg-[var(--surface)] cursor-pointer transition-colors',
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
