import type { TaskRow } from '@/lib/db/types'

export type RetryStage = 'generate' | 'review' | 'publish'

const RETRY_STAGES: RetryStage[] = ['generate', 'review', 'publish']

export function isRetryStage(v: unknown): v is RetryStage {
  return typeof v === 'string' && RETRY_STAGES.includes(v as RetryStage)
}

export function inferFailedStage(args: {
  task: TaskRow
  reason?: string | null
  summary?: string | null
}): RetryStage {
  if (isRetryStage(args.task.failed_stage)) return args.task.failed_stage

  const text = `${args.reason ?? ''} ${args.summary ?? ''} ${args.task.reviewer_notes ?? ''}`
    .toLowerCase()
    .trim()

  if (
    text.includes('publish') ||
    text.includes('posting') ||
    text.includes('upload') ||
    text.includes('social') ||
    text.includes('platform') ||
    text.includes('post')
  ) {
    return 'publish'
  }
  if (
    text.includes('review') ||
    text.includes('score') ||
    text.includes('moderation')
  ) {
    return 'review'
  }
  if (
    text.includes('generate') ||
    text.includes('render') ||
    text.includes('image') ||
    text.includes('video')
  ) {
    return 'generate'
  }

  if (args.task.review_score !== null || args.task.published_to) {
    return 'publish'
  }
  if (args.task.media_url) {
    return 'review'
  }
  return 'generate'
}
