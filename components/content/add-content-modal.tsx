'use client'
import { useState, useMemo } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUIStore } from '@/lib/store'
import { CONTENT_TYPES, SOCIAL_PLATFORMS, DIMENSION_PRESETS, PLATFORM_SUPPORT } from '@/lib/constants'
import type { ContentType, SocialPlatform } from '@/lib/types'
import { cn, parseVariables } from '@/lib/utils'
import { SocialIcon } from '@/components/shared/social-icon'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

const STEPS = ['Type & Dimensions', 'Platforms', 'Template', 'Schedule']

// "now" first by design — it's the most common path and the default selection.
type ScheduleKind = 'now' | 'once' | 'hourly' | 'daily' | 'weekly'
const SCHEDULE_KINDS: ScheduleKind[] = ['now', 'once', 'hourly', 'daily', 'weekly']

const SCHEDULE_DESCRIPTIONS: Record<ScheduleKind, string> = {
  now: 'Execute immediately. Runs once as soon as you confirm.',
  once: 'Run a single time at a specific date and time.',
  hourly: 'Run on an hourly cadence.',
  daily: 'Run every day at a fixed time.',
  weekly: 'Run on chosen days of the week at a fixed time.',
}

function expandPrompt(
  body: string,
  values: Record<string, string>
): string {
  return body.replace(/\{([a-zA-Z0-9_]+)\}/g, (m, name: string) =>
    values[name] && values[name].trim() ? values[name] : m
  )
}

function dimensionRatio(w: number, h: number): string {
  if (w === h) return '1:1'
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))
  const g = gcd(w, h)
  return `${w / g}:${h / g}`
}

export function AddContentModal() {
  const open = useUIStore((s) => s.addContentOpen)
  const setOpen = useUIStore((s) => s.setAddContentOpen)
  const qc = useQueryClient()

  const { data: templates = [] } = useQuery({
    queryKey: ['prompts'],
    queryFn: () => api.listPrompts(),
    enabled: open,
  })

  const create = useMutation({
    mutationFn: (payload: Parameters<typeof api.createTask>[0]) =>
      api.createTask(payload),
    onSuccess: (task) => {
      qc.invalidateQueries({ queryKey: ['tasks'] })
      // best-effort activity log
      void api
        .postActivity(task.id, {
          activity_type: 'queued',
          message: 'Queued from Add Content modal',
        })
        .catch(() => {})
      toast.success('Content queued')
      close()
    },
    onError: (err: unknown) => {
      toast.error(
        `Failed to queue: ${err instanceof Error ? err.message : 'unknown'}`
      )
    },
  })

  const [step, setStep] = useState(0)
  const [contentType, setContentType] = useState<ContentType | null>(null)
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null)
  const [customDim, setCustomDim] = useState<{ w: string; h: string }>({ w: '', h: '' })
  const [useCustom, setUseCustom] = useState(false)
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [scheduleKind, setScheduleKind] = useState<ScheduleKind>('now')
  const [scheduleAt, setScheduleAt] = useState<string>('')
  const [intervalHours, setIntervalHours] = useState<string>('1')
  const [timeOfDay, setTimeOfDay] = useState<string>('09:00')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5])

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  )
  const detectedVars = selectedTemplate ? parseVariables(selectedTemplate.body) : []

  function reset() {
    setStep(0)
    setContentType(null)
    setDim(null)
    setUseCustom(false)
    setCustomDim({ w: '', h: '' })
    setPlatforms([])
    setTemplateId('')
    setVariableValues({})
    setScheduleKind('now')
    setScheduleAt('')
  }

  function close() {
    setOpen(false)
    setTimeout(reset, 200)
  }

  function next() {
    if (step === 0 && (!contentType || (!dim && !useCustom))) {
      toast.error('Pick a content type and dimensions')
      return
    }
    if (step === 0 && useCustom && (!customDim.w || !customDim.h)) {
      toast.error('Enter custom width and height')
      return
    }
    if (step === 1 && platforms.length === 0) {
      toast.error('Pick at least one platform')
      return
    }
    if (step === 2 && !templateId) {
      toast.error('Select a prompt template')
      return
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  function back() {
    setStep((s) => Math.max(s - 1, 0))
  }

  function confirm() {
    if (!contentType || !templateId || !selectedTemplate) {
      toast.error('Form incomplete')
      return
    }
    const finalDim = useCustom
      ? {
          width: parseInt(customDim.w, 10) || 1080,
          height: parseInt(customDim.h, 10) || 1080,
        }
      : { width: dim!.w, height: dim!.h }

    const ratio = dimensionRatio(finalDim.width, finalDim.height)

    let schedule_at: string | undefined
    const meta: Record<string, unknown> = {}
    if (scheduleKind === 'now') {
      schedule_at = new Date().toISOString()
    } else if (scheduleKind === 'once') {
      schedule_at = scheduleAt
        ? new Date(scheduleAt).toISOString()
        : new Date(Date.now() + 60 * 60 * 1000).toISOString()
    } else if (scheduleKind === 'hourly') {
      const h = parseInt(intervalHours, 10) || 1
      meta.intervalHours = h
      schedule_at = new Date().toISOString()
    } else if (scheduleKind === 'daily') {
      meta.timeOfDay = timeOfDay
      schedule_at = new Date().toISOString()
    } else if (scheduleKind === 'weekly') {
      meta.timeOfDay = timeOfDay
      meta.daysOfWeek = daysOfWeek
      schedule_at = new Date().toISOString()
    }

    const promptBody = expandPrompt(selectedTemplate.body, variableValues)

    create.mutate({
      title: selectedTemplate.name,
      description: promptBody,
      priority: 'normal',
      content_type: contentType,
      dimensions: { ...finalDim, ratio },
      platforms,
      template_id: templateId,
      prompt_body: promptBody,
      schedule_kind: scheduleKind,
      schedule_at,
      schedule_meta: Object.keys(meta).length ? meta : undefined,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : close())}>
      <DialogContent className="max-w-2xl">
        <DialogTitle>Add Content</DialogTitle>

        {/* Step indicator */}
        <div className="flex items-center gap-2 mb-6">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2 flex-1">
              <div
                className={cn(
                  'h-1.5 flex-1 rounded-full',
                  i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--border)]'
                )}
              />
            </div>
          ))}
        </div>
        <div className="text-xs font-mono uppercase tracking-wider text-[var(--muted)] mb-4">
          Step {step + 1} of {STEPS.length} — {STEPS[step]}
        </div>

        {/* Step 1 */}
        {step === 0 && (
          <div className="space-y-6">
            <div>
              <div className="section-label mb-3">Content Type</div>
              <div className="grid grid-cols-5 gap-2">
                {CONTENT_TYPES.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => {
                      setContentType(t.id)
                      setDim(null)
                      setUseCustom(false)
                    }}
                    className={cn(
                      'flex flex-col items-center justify-center gap-2 p-4 rounded-md border transition-colors',
                      contentType === t.id
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border)] hover:border-[var(--muted)]'
                    )}
                  >
                    <span className="text-2xl">{t.icon}</span>
                    <span className="text-xs font-mono uppercase">{t.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {contentType && (
              <div>
                <div className="section-label mb-3">Dimensions</div>
                <div className="flex flex-wrap gap-2">
                  {DIMENSION_PRESETS[contentType].map((d) => (
                    <button
                      key={d.label}
                      onClick={() => {
                        setDim({ w: d.w, h: d.h })
                        setUseCustom(false)
                      }}
                      className={cn(
                        'px-3 py-1.5 rounded-md border text-xs font-mono',
                        !useCustom && dim?.w === d.w && dim.h === d.h
                          ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                          : 'border-[var(--border)] hover:border-[var(--muted)]'
                      )}
                    >
                      {d.label}
                    </button>
                  ))}
                  <button
                    onClick={() => {
                      setUseCustom(true)
                      setDim(null)
                    }}
                    className={cn(
                      'px-3 py-1.5 rounded-md border text-xs font-mono',
                      useCustom
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border)] hover:border-[var(--muted)]'
                    )}
                  >
                    Custom
                  </button>
                </div>
                {useCustom && (
                  <div className="flex gap-2 mt-3 items-center">
                    <Input
                      type="number"
                      placeholder="Width"
                      value={customDim.w}
                      onChange={(e) => setCustomDim((c) => ({ ...c, w: e.target.value }))}
                      className="w-32"
                    />
                    <span className="text-[var(--muted)]">×</span>
                    <Input
                      type="number"
                      placeholder="Height"
                      value={customDim.h}
                      onChange={(e) => setCustomDim((c) => ({ ...c, h: e.target.value }))}
                      className="w-32"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Step 2 */}
        {step === 1 && (
          <div className="space-y-4">
            <div className="section-label">Select Platforms</div>
            <div className="grid grid-cols-3 gap-2">
              {SOCIAL_PLATFORMS.map((p) => {
                const supported = !contentType || PLATFORM_SUPPORT[p.id].includes(contentType)
                const active = platforms.includes(p.id)
                return (
                  <button
                    key={p.id}
                    onClick={() =>
                      setPlatforms((cur) =>
                        cur.includes(p.id) ? cur.filter((x) => x !== p.id) : [...cur, p.id]
                      )
                    }
                    className={cn(
                      'flex items-center gap-2 p-3 rounded-md border text-sm transition-colors',
                      active
                        ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                        : 'border-[var(--border)] hover:border-[var(--muted)]',
                      !supported && 'opacity-50'
                    )}
                  >
                    <SocialIcon platform={p.id} />
                    <span>{p.label}</span>
                  </button>
                )
              })}
            </div>
            {platforms.some((p) => contentType && !PLATFORM_SUPPORT[p].includes(contentType)) && (
              <div className="flex items-start gap-2 p-3 rounded-md border border-[var(--warning)]/40 bg-[var(--warning)]/10 text-xs">
                <AlertTriangle className="h-4 w-4 text-[var(--warning)] flex-shrink-0 mt-0.5" />
                <span>
                  Some selected platforms don&apos;t support this content type. They may be skipped at publish time.
                </span>
              </div>
            )}
          </div>
        )}

        {/* Step 3 */}
        {step === 2 && (
          <div className="space-y-4">
            <div className="section-label">Prompt Template</div>
            {templates.length === 0 ? (
              <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-4 text-sm text-[var(--muted)]">
                No prompt templates yet. Create one on the Prompts page first.
              </div>
            ) : (
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose a template…" />
                </SelectTrigger>
                <SelectContent>
                  {templates.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {selectedTemplate && (
              <>
                <div className="rounded-md border border-[var(--border)] bg-[var(--background)] p-3 font-mono text-xs whitespace-pre-wrap text-[var(--muted)] max-h-32 overflow-auto">
                  {selectedTemplate.body}
                </div>
                {detectedVars.length > 0 && (
                  <div className="space-y-2">
                    <div className="section-label">Variable Overrides (Optional)</div>
                    {detectedVars.map((v) => (
                      <div key={v} className="flex items-center gap-2">
                        <span className="text-xs font-mono text-[var(--accent)] w-32">
                          {`{${v}}`}
                        </span>
                        <Input
                          placeholder="Leave blank for agent to fill"
                          value={variableValues[v] ?? ''}
                          onChange={(e) =>
                            setVariableValues((vv) => ({ ...vv, [v]: e.target.value }))
                          }
                        />
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Step 4 */}
        {step === 3 && (
          <div className="space-y-4">
            <div className="section-label">Schedule</div>
            <RadioGroup
              value={scheduleKind}
              onValueChange={(v) => setScheduleKind(v as ScheduleKind)}
              className="grid grid-cols-1 gap-2"
            >
              {SCHEDULE_KINDS.map((t) => (
                <label
                  key={t}
                  className={cn(
                    'flex items-start gap-3 p-3 rounded-md border cursor-pointer transition-colors',
                    scheduleKind === t
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)] hover:border-[var(--muted)]'
                  )}
                >
                  <RadioGroupItem value={t} className="mt-0.5" />
                  <div className="flex flex-col">
                    <span className="text-sm font-mono uppercase">{t}</span>
                    <span className="text-xs text-[var(--muted)]">
                      {SCHEDULE_DESCRIPTIONS[t]}
                    </span>
                  </div>
                </label>
              ))}
            </RadioGroup>

            {scheduleKind === 'once' && (
              <div>
                <label className="section-label block mb-2">Date & Time</label>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </div>
            )}
            {scheduleKind === 'hourly' && (
              <div className="flex gap-2 items-center">
                <span className="text-sm">Every</span>
                <Input
                  type="number"
                  min={1}
                  value={intervalHours}
                  onChange={(e) => setIntervalHours(e.target.value)}
                  className="w-20"
                />
                <span className="text-sm">hour(s)</span>
              </div>
            )}
            {(scheduleKind === 'daily' || scheduleKind === 'weekly') && (
              <div>
                <label className="section-label block mb-2">Time of Day</label>
                <Input
                  type="time"
                  value={timeOfDay}
                  onChange={(e) => setTimeOfDay(e.target.value)}
                  className="w-32"
                />
              </div>
            )}
            {scheduleKind === 'weekly' && (
              <div>
                <label className="section-label block mb-2">Days of Week</label>
                <div className="flex gap-2">
                  {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => {
                    const active = daysOfWeek.includes(i)
                    return (
                      <button
                        key={i}
                        onClick={() =>
                          setDaysOfWeek((cur) =>
                            cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]
                          )
                        }
                        className={cn(
                          'h-8 w-8 rounded-md border text-xs font-mono',
                          active
                            ? 'border-[var(--accent)] bg-[var(--accent)]/10 text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--muted)]'
                        )}
                      >
                        {d}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <div className="text-xs font-mono text-[var(--muted)] p-3 rounded-md bg-[var(--background)] border border-[var(--border)]">
              {scheduleKind === 'now' && (
                <span>
                  Will run{' '}
                  <span className="text-[var(--accent)]">immediately</span>.
                </span>
              )}
              {scheduleKind === 'once' && (
                <span>
                  Will run once on{' '}
                  <span className="text-[var(--accent)]">
                    {scheduleAt || 'next hour'}
                  </span>
                  .
                </span>
              )}
              {scheduleKind === 'hourly' && (
                <span>
                  Will run{' '}
                  <span className="text-[var(--accent)]">every {intervalHours}h</span>.
                </span>
              )}
              {scheduleKind === 'daily' && (
                <span>
                  Will run{' '}
                  <span className="text-[var(--accent)]">daily at {timeOfDay}</span>.
                </span>
              )}
              {scheduleKind === 'weekly' && (
                <span>
                  Will run{' '}
                  <span className="text-[var(--accent)]">
                    {daysOfWeek.length} day(s)/week at {timeOfDay}
                  </span>
                  .
                </span>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between mt-8 pt-4 border-t border-[var(--border)]">
          <button onClick={close} className="text-xs text-[var(--muted)] hover:text-[var(--foreground)]">
            Cancel
          </button>
          <div className="flex gap-2">
            {step > 0 && (
              <Button variant="outline" size="sm" onClick={back}>
                <ChevronLeft className="h-4 w-4" />
                Back
              </Button>
            )}
            {step < STEPS.length - 1 ? (
              <Button size="sm" onClick={next}>
                Next
                <ChevronRight className="h-4 w-4" />
              </Button>
            ) : (
              <Button size="sm" onClick={confirm} disabled={create.isPending}>
                {create.isPending ? 'Queueing…' : 'Confirm & Queue'}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
