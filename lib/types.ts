export type ContentType = 'image' | 'video' | 'carousel' | 'reel' | 'story'
export type SocialPlatform =
  | 'instagram'
  | 'tiktok'
  | 'youtube'
  | 'twitter'
  | 'linkedin'
  | 'facebook'
  | 'pinterest'
export type ContentStatus =
  | 'queued'
  | 'generating'
  | 'reviewing'
  | 'approved'
  | 'rejected'
  | 'published'
  | 'failed'
export type ScheduleType = 'once' | 'hourly' | 'daily' | 'weekly'
export type AgentStatus = 'idle' | 'running' | 'error'

export interface PromptTemplate {
  id: string
  name: string
  body: string
  contentTypes: ContentType[]
  toneHints?: string
  negativePrompt?: string
  variables: TemplateVariable[]
  usageCount: number
  lastUsedAt?: string
  createdAt: string
  updatedAt: string
}

export interface TemplateVariable {
  name: string
  description?: string
}

export interface ContentItem {
  id: string
  templateId: string
  templateName: string
  generatedPrompt: string
  contentType: ContentType
  dimensions: { width: number; height: number }
  platforms: SocialPlatform[]
  status: ContentStatus
  reviewScore?: number
  reviewNotes?: string
  mediaUrl?: string
  thumbnailUrl?: string
  schedule: ScheduleConfig
  publishedPosts?: PublishedPost[]
  createdAt: string
  scheduledAt?: string
  publishedAt?: string
}

export interface PublishedPost {
  platform: SocialPlatform
  postUrl: string
  publishedAt: string
}

export interface ScheduleConfig {
  type: ScheduleType
  startAt: string
  intervalHours?: number
  timeOfDay?: string
  daysOfWeek?: number[]
}

export interface AgentConfig {
  id: string
  name: string
  role: string
  description: string
  capabilities: string[]
  modelId: string
  status: AgentStatus
  lastRun?: string
  currentJobId?: string
  instructionsMarkdown: string
}

export interface AppSettings {
  agentModels: Record<string, string>
  reviewThreshold: number
  maxRetries: number
  notifyOnPublish: boolean
  notifyOnFailure: boolean
  webhookUrl?: string
}
