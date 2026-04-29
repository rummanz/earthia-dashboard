import type { ContentType, SocialPlatform } from './types'

export const CONTENT_TYPES: { id: ContentType; label: string; icon: string }[] = [
  { id: 'image', label: 'Image', icon: '🖼' },
  { id: 'video', label: 'Video', icon: '🎬' },
  { id: 'carousel', label: 'Carousel', icon: '🃏' },
  { id: 'reel', label: 'Reel', icon: '📱' },
  { id: 'story', label: 'Story', icon: '📖' },
]

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string }[] = [
  { id: 'instagram', label: 'Instagram' },
  { id: 'tiktok', label: 'TikTok' },
  { id: 'youtube', label: 'YouTube' },
  { id: 'twitter', label: 'Twitter / X' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'facebook', label: 'Facebook' },
  { id: 'pinterest', label: 'Pinterest' },
]

export const DIMENSION_PRESETS: Record<ContentType, { label: string; w: number; h: number }[]> = {
  image: [
    { label: '1:1 (1080×1080)', w: 1080, h: 1080 },
    { label: '4:5 (1080×1350)', w: 1080, h: 1350 },
    { label: '16:9 (1920×1080)', w: 1920, h: 1080 },
  ],
  video: [
    { label: '9:16 (1080×1920)', w: 1080, h: 1920 },
    { label: '16:9 (1920×1080)', w: 1920, h: 1080 },
    { label: '1:1 (1080×1080)', w: 1080, h: 1080 },
  ],
  carousel: [
    { label: '1:1 (1080×1080)', w: 1080, h: 1080 },
    { label: '4:5 (1080×1350)', w: 1080, h: 1350 },
  ],
  reel: [{ label: '9:16 (1080×1920)', w: 1080, h: 1920 }],
  story: [{ label: '9:16 (1080×1920)', w: 1080, h: 1920 }],
}

export const DEFAULT_MODELS = [
  { id: 'claude-opus-4-5', label: 'Claude Opus 4.5 (Most Capable)' },
  { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4 (Balanced)' },
  { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5 (Fastest)' },
  { id: 'gpt-4o', label: 'GPT-4o' },
  { id: 'gpt-4o-mini', label: 'GPT-4o Mini' },
  { id: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  { id: 'flux-1.1-pro', label: 'Flux 1.1 Pro (Image)' },
  { id: 'runway-gen4', label: 'Runway Gen-4 (Video)' },
]

export const PLATFORM_SUPPORT: Record<SocialPlatform, ContentType[]> = {
  instagram: ['image', 'video', 'carousel', 'reel', 'story'],
  tiktok: ['video', 'reel'],
  youtube: ['video', 'reel'],
  twitter: ['image', 'video'],
  linkedin: ['image', 'video', 'carousel'],
  facebook: ['image', 'video', 'carousel', 'story'],
  pinterest: ['image', 'video'],
}
