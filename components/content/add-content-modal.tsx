'use client'
import { useState } from 'react'
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useUIStore, useContentStore, useTemplateStore } from '@/lib/store'
import { CONTENT_TYPES, SOCIAL_PLATFORMS, DIMENSION_PRESETS, PLATFORM_SUPPORT } from '@/lib/constants'
import type { ContentType, SocialPlatform, ScheduleType, ContentItem } from '@/lib/types'
import { cn, uid, parseVariables } from '@/lib/utils'
import { SocialIcon } from '@/components/shared/social-icon'
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { toast } from 'sonner'
import { ChevronLeft, ChevronRight, AlertTriangle } from 'lucide-react'
import { api } from '@/lib/api'
import { useQueryClient } from '@tanstack/react-query'

const STEPS = ['Type & Dimensions', 'Platforms', 'Template', 'Schedule']

export function AddContentModal() {
  const open = useUIStore((s) => s.addContentOpen)
  const setOpen = useUIStore((s) => s.setAddContentOpen)
  const addItem = useContentStore((s) => s.add)
  const templates = useTemplateStore((s) => s.templates)
  const qc = useQueryClient()

  const [step, setStep] = useState(0)
  const [contentType, setContentType] = useState<ContentType | null>(null)
  const [dim, setDim] = useState<{ w: number; h: number } | null>(null)
  const [customDim, setCustomDim] = useState<{ w: string; h: string }>({ w: '', h: '' })
  const [useCustom, setUseCustom] = useState(false)
  const [platforms, setPlatforms] = useState<SocialPlatform[]>([])
  const [templateId, setTemplateId] = useState<string>('')
  const [variableValues, setVariableValues] = useState<Record<string, string>>({})
  const [scheduleType, setScheduleType] = useState<ScheduleType>('once')
  const [scheduleAt, setScheduleAt] = useState<string>('')
  const [intervalHours, setIntervalHours] = useState<string>('1')
  const [timeOfDay, setTimeOfDay] = useState<string>('09:00')
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([1, 3, 5])

  const selectedTemplate = templates.find((t) => t.id === templateId)
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
    setScheduleType('once')
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

  async function confirm() {
    if (!contentType || !templateId || !selectedTemplate) {
      toast.error('Form incomplete')
      return
    }
    const finalDim = useCustom
      ? { width: parseInt(customDim.w, 10) || 1080, height: parseInt(customDim.h, 10) || 1080 }
      : { width: dim!.w, height: dim!.h }

    const startAt = scheduleAt || new Date(Date.now() + 60 * 60 * 1000).toISOString()

    const newItem: ContentItem = {
      id: uid('c'),
      templateId,
      templateName: selectedTemplate.name,
      generatedPrompt: '(pending generation)',
      contentType,
      dimensions: finalDim,
      platforms,
      status: 'queued',
      schedule: {
        type: scheduleType,
        startAt,
        intervalHours: scheduleType === 'hourly' ? parseInt(intervalHours, 10) : undefined,
        timeOfDay: scheduleType === 'daily' || scheduleType === 'weekly' ? timeOfDay : undefined,
        daysOfWeek: scheduleType === 'weekly' ? daysOfWeek : undefined,
      },
      createdAt: new Date().toISOString(),
      scheduledAt: startAt,
    }
    // Optimistic UI update for the existing local store.
    addItem(newItem)
    // Persist to Mission Control backend as a Task. Best-effort.
    try {
      const description = JSON.stringify(
        {
          template_id: templateId,
          template_name: selectedTemplate.name,
          content_type: contentType,
          dimensions: finalDim,
          platforms,
          variables: variableValues,
          schedule: newItem.schedule,
        },
        null,
        2
      )
      const task = await api.createTask({
        title: selectedTemplate.name,
        description,
        priority: 'normal',
      })
      await api
        .postActivity(task.id, {
          activity_type: 'updated',
          message: 'Queued from Add Content modal',
          metadata: JSON.stringify({
            content_type: contentType,
            platforms,
          }),
        })
        .catch(() => {})
      qc.invalidateQueries({ queryKey: ['tasks'] })
      toast.success('Content queued')
    } catch (err) {
      toast.warning(
        `Saved locally; backend persist failed: ${err instanceof Error ? err.message : 'unknown'}`
      )
    }
    close()
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
              value={scheduleType}
              onValueChange={(v) => setScheduleType(v as ScheduleType)}
              className="grid grid-cols-2 gap-2"
            >
              {(['once', 'hourly', 'daily', 'weekly'] as ScheduleType[]).map((t) => (
                <label
                  key={t}
                  className={cn(
                    'flex items-center gap-3 p-3 rounded-md border cursor-pointer',
                    scheduleType === t
                      ? 'border-[var(--accent)] bg-[var(--accent)]/10'
                      : 'border-[var(--border)]'
                  )}
                >
                  <RadioGroupItem value={t} />
                  <span className="text-sm font-mono uppercase">{t}</span>
                </label>
              ))}
            </RadioGroup>

            {scheduleType === 'once' && (
              <div>
                <label className="section-label block mb-2">Date & Time</label>
                <Input
                  type="datetime-local"
                  value={scheduleAt}
                  onChange={(e) => setScheduleAt(e.target.value)}
                />
              </div>
            )}
            {scheduleType === 'hourly' && (
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
            {(scheduleType === 'daily' || scheduleType === 'weekly') && (
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
            {scheduleType === 'weekly' && (
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
              Will generate and post on{' '}
              <span className="text-[var(--accent)]">
                {scheduleType === 'once' && (scheduleAt || 'next hour')}
                {scheduleType === 'hourly' && `every ${intervalHours}h`}
                {scheduleType === 'daily' && `daily at ${timeOfDay}`}
                {scheduleType === 'weekly' && `${daysOfWeek.length} day(s)/week at ${timeOfDay}`}
              </span>
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
              <Button size="sm" onClick={confirm}>
                Confirm & Queue
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
