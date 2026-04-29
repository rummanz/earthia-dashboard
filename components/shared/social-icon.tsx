import type { SocialPlatform, PublishedPost } from '@/lib/types'
import { cn } from '@/lib/utils'

type IconCmp = React.ComponentType<{ className?: string }>

function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="0.6" fill="currentColor" />
    </svg>
  )
}

function TikTokIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M19.59 6.69a4.83 4.83 0 0 1-3.77-4.25V2h-3.45v13.67a2.89 2.89 0 0 1-5.2 1.74 2.89 2.89 0 0 1 2.31-4.64 2.93 2.93 0 0 1 .88.13V9.4a6.84 6.84 0 0 0-1-.05A6.33 6.33 0 0 0 5.8 20.1a6.34 6.34 0 0 0 10.86-4.43V8.8a8.16 8.16 0 0 0 4.77 1.52V6.87a4.83 4.83 0 0 1-1.84-.18z" />
    </svg>
  )
}

function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5 31 31 0 0 0 .6 12 31 31 0 0 0 1 16.5a3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4a3 3 0 0 0 2.1-2.1A31 31 0 0 0 23.4 12 31 31 0 0 0 23 7.5zM10 15.5v-7L16 12l-6 3.5z" />
    </svg>
  )
}

function TwitterIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  )
}

function LinkedInIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 1 1 8.3 6.5a1.78 1.78 0 0 1-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0 0 13 14.19a.66.66 0 0 0 0 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 0 1 2.7-1.4c1.55 0 3.36.86 3.36 3.66z" />
    </svg>
  )
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M22 12a10 10 0 1 0-11.56 9.88v-6.99H7.9v-2.89h2.54V9.8c0-2.51 1.5-3.9 3.78-3.9a15.5 15.5 0 0 1 2.24.2v2.46h-1.26c-1.24 0-1.63.77-1.63 1.56V12h2.78l-.45 2.89h-2.34v6.99A10 10 0 0 0 22 12z" />
    </svg>
  )
}

function PinterestIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.09 2.46 7.6 5.97 9.13-.08-.78-.16-1.97.03-2.82.18-.77 1.16-4.92 1.16-4.92s-.3-.6-.3-1.49c0-1.39.81-2.43 1.81-2.43.85 0 1.27.64 1.27 1.41 0 .86-.55 2.14-.83 3.33-.24 1 .5 1.81 1.49 1.81 1.79 0 3.16-1.89 3.16-4.61 0-2.41-1.74-4.1-4.22-4.1-2.87 0-4.56 2.16-4.56 4.39 0 .87.33 1.8.75 2.31.08.1.09.19.07.29-.08.32-.25 1-.28 1.14-.04.19-.15.23-.34.14-1.25-.58-2.04-2.41-2.04-3.88 0-3.16 2.3-6.07 6.62-6.07 3.48 0 6.18 2.48 6.18 5.79 0 3.46-2.18 6.24-5.21 6.24-1.02 0-1.97-.53-2.3-1.16l-.62 2.39c-.23.87-.84 1.96-1.25 2.62A10 10 0 0 0 22 12c0-5.52-4.48-10-10-10z" />
    </svg>
  )
}

const ICONS: Record<SocialPlatform, IconCmp> = {
  instagram: InstagramIcon,
  tiktok: TikTokIcon,
  youtube: YouTubeIcon,
  twitter: TwitterIcon,
  linkedin: LinkedInIcon,
  facebook: FacebookIcon,
  pinterest: PinterestIcon,
}

interface SocialIconRowProps {
  platforms: SocialPlatform[]
  publishedPosts?: PublishedPost[]
  className?: string
}

const ALL: SocialPlatform[] = ['instagram', 'tiktok', 'youtube', 'twitter', 'linkedin', 'facebook', 'pinterest']

export function SocialIconRow({ platforms, publishedPosts, className }: SocialIconRowProps) {
  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {ALL.filter((p) => platforms.includes(p)).map((p) => {
        const Icon = ICONS[p]
        const post = publishedPosts?.find((pp) => pp.platform === p)
        const published = !!post
        const inner = (
          <Icon
            className={cn(
              'h-4 w-4',
              published ? 'text-[var(--accent)]' : 'text-[var(--muted)] opacity-60'
            )}
          />
        )
        if (published && post.postUrl) {
          return (
            <a
              key={p}
              href={post.postUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="hover:scale-110 transition-transform"
              title={`View on ${p}`}
            >
              {inner}
            </a>
          )
        }
        return (
          <span key={p} title={p}>
            {inner}
          </span>
        )
      })}
    </div>
  )
}

export function SocialIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  const Icon = ICONS[platform]
  return <Icon className={cn('h-4 w-4', className)} />
}
