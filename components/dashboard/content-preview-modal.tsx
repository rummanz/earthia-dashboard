'use client'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { useSettingsStore } from '@/lib/store'
import { StatusBadge } from '@/components/shared/status-badge'
import { ScoreBar } from '@/components/shared/score-bar'
import { SocialIconRow } from '@/components/shared/social-icon'
import type { ContentItem } from '@/lib/types'
import { formatDate } from '@/lib/utils'
import { Image as ImageIcon, Play } from 'lucide-react'

interface Props {
  item: ContentItem | null
  onClose: () => void
}

export function ContentPreviewModal({ item, onClose }: Props) {
  const threshold = useSettingsStore((s) => s.settings.reviewThreshold)

  return (
    <Dialog open={!!item} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-5xl">
        <DialogTitle>{item?.templateName ?? 'Content'}</DialogTitle>
        {item && (
          <div className="grid md:grid-cols-2 gap-6 mt-2">
            {/* Left: media */}
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

            {/* Right: details */}
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
                  <SocialIconRow platforms={item.platforms} publishedPosts={item.publishedPosts} />
                </Section>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
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
