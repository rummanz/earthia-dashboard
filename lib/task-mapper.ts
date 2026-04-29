import type { TaskRow } from './api'
import type {
  ContentItem,
  ContentStatus,
  ContentType,
  PublishedPost,
  ScheduleType,
  SocialPlatform,
} from './types'

const VALID_PLATFORMS: ReadonlySet<SocialPlatform> = new Set<SocialPlatform>([
  'instagram',
  'tiktok',
  'youtube',
  'twitter',
  'linkedin',
  'facebook',
  'pinterest',
])

const VALID_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  'image',
  'video',
  'carousel',
  'reel',
  'story',
])

function safeJson<T>(s: string | null | undefined): T | null {
  if (!s) return null
  try {
    return JSON.parse(s) as T
  } catch {
    return null
  }
}

function statusToContent(s: string): ContentStatus {
  switch (s) {
    case 'queued':
      return 'queued'
    case 'generating':
    case 'in_progress':
    case 'assigned':
      return 'generating'
    case 'reviewing':
    case 'testing':
    case 'review':
      return 'reviewing'
    case 'approved':
      return 'approved'
    case 'rejected':
    case 'cancelled':
      return 'rejected'
    case 'published':
    case 'done':
      return 'published'
    case 'failed':
      return 'failed'
    default:
      return 'queued'
  }
}

function scheduleKindToType(k: string | null): ScheduleType {
  switch (k) {
    case 'hourly':
      return 'hourly'
    case 'daily':
      return 'daily'
    case 'weekly':
      return 'weekly'
    // 'now' and 'once' both render as one-shot in the legacy ContentItem shape.
    default:
      return 'once'
  }
}

export function taskToContentItem(t: TaskRow): ContentItem {
  const dimsRaw = safeJson<{ width?: number; height?: number }>(t.dimensions)
  const dimensions = {
    width: typeof dimsRaw?.width === 'number' ? dimsRaw.width : 1080,
    height: typeof dimsRaw?.height === 'number' ? dimsRaw.height : 1080,
  }
  const platformsRaw = safeJson<unknown[]>(t.platforms) ?? []
  const platforms = platformsRaw.filter(
    (p): p is SocialPlatform =>
      typeof p === 'string' && VALID_PLATFORMS.has(p as SocialPlatform)
  )
  const contentType: ContentType =
    t.content_type && VALID_CONTENT_TYPES.has(t.content_type as ContentType)
      ? (t.content_type as ContentType)
      : 'image'

  const meta = safeJson<Record<string, unknown>>(t.schedule_meta) ?? {}
  const startAt = t.schedule_at || t.next_run_at || t.created_at

  const publishedToRaw =
    safeJson<Record<string, string | null>>(t.published_to) ?? {}
  const publishedPosts: PublishedPost[] = []
  for (const [platform, postUrl] of Object.entries(publishedToRaw)) {
    if (typeof postUrl === 'string' && VALID_PLATFORMS.has(platform as SocialPlatform)) {
      publishedPosts.push({
        platform: platform as SocialPlatform,
        postUrl,
        publishedAt: t.published_at ?? t.updated_at,
      })
    }
  }

  return {
    id: t.id,
    templateId: t.template_id ?? '',
    templateName: t.title,
    generatedPrompt: t.prompt_body ?? t.description ?? '',
    contentType,
    dimensions,
    platforms,
    status: statusToContent(t.status),
    reviewScore: t.review_score ?? undefined,
    reviewNotes: t.reviewer_notes ?? undefined,
    mediaUrl: t.media_url ?? undefined,
    thumbnailUrl: t.thumbnail_url ?? undefined,
    schedule: {
      type: scheduleKindToType(t.schedule_kind),
      startAt,
      intervalHours:
        typeof meta.intervalHours === 'number' ? meta.intervalHours : undefined,
      timeOfDay:
        typeof meta.timeOfDay === 'string' ? meta.timeOfDay : undefined,
      daysOfWeek: Array.isArray(meta.daysOfWeek)
        ? (meta.daysOfWeek as number[])
        : undefined,
    },
    publishedPosts: publishedPosts.length ? publishedPosts : undefined,
    createdAt: t.created_at,
    scheduledAt: t.next_run_at ?? t.schedule_at ?? undefined,
    publishedAt: t.published_at ?? undefined,
  }
}
