export function parseMediaReferences(raw: string | null | undefined): string[] {
  if (!raw) return []
  const trimmed = raw.trim()
  if (!trimmed) return []

  if (trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (Array.isArray(parsed)) {
        return parsed
          .filter((v): v is string => typeof v === 'string')
          .map((v) => v.trim())
          .filter(Boolean)
      }
    } catch {
      // treat as plain string below
    }
  }

  if (trimmed.includes(',')) {
    return trimmed
      .split(',')
      .map((v) => v.trim())
      .filter(Boolean)
  }

  return [trimmed]
}

function fileNameFromPath(input: string): string {
  const normalized = input.replace(/\\/g, '/')
  const parts = normalized.split('/').filter(Boolean)
  return parts[parts.length - 1] ?? ''
}

function isLocalLikePath(input: string): boolean {
  return (
    input.startsWith('/') ||
    input.startsWith('./') ||
    input.startsWith('../') ||
    /^[a-zA-Z]:[\\/]/.test(input)
  )
}

function isRemoteUrl(input: string): boolean {
  return /^https?:\/\//i.test(input)
}

export function normalizeMediaReference(
  taskId: string,
  rawRef: string | null | undefined
): string | undefined {
  if (!rawRef) return undefined
  let ref = rawRef.trim()
  if (!ref) return undefined

  if (ref.startsWith('file://')) {
    ref = decodeURIComponent(ref.slice('file://'.length))
  }

  if (ref.startsWith('/api/media/')) return ref
  if (isRemoteUrl(ref) || ref.startsWith('data:') || ref.startsWith('blob:')) {
    return ref
  }

  const fileName = fileNameFromPath(ref)
  if (!fileName) return undefined

  const safeTaskId = encodeURIComponent(taskId)
  const safeFile = encodeURIComponent(fileName)

  if (isLocalLikePath(ref) || ref.includes('/') || ref.includes('\\')) {
    return `/api/media/${safeTaskId}/${safeFile}?path=${encodeURIComponent(ref)}`
  }

  return `/api/media/${safeTaskId}/${safeFile}`
}

export function isVideoMediaUrl(url: string): boolean {
  const lower = url.toLowerCase()
  return (
    lower.endsWith('.mp4') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.mov') ||
    lower.endsWith('.m4v')
  )
}
