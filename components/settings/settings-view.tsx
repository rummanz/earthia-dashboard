'use client'
import { useSettingsStore } from '@/lib/store'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { DEFAULT_MODELS } from '@/lib/constants'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useState } from 'react'
import { toast } from 'sonner'

interface AgentLite {
  id: string
  name: string
  description: string
  defaultModel?: string
}

export function SettingsView({ agents }: { agents: AgentLite[] }) {
  const settings = useSettingsStore((s) => s.settings)
  const setAgentModel = useSettingsStore((s) => s.setAgentModel)
  const update = useSettingsStore((s) => s.update)

  const [threshold, setThreshold] = useState(settings.reviewThreshold)
  const [retries, setRetries] = useState(settings.maxRetries)
  const [notifyPub, setNotifyPub] = useState(settings.notifyOnPublish)
  const [notifyFail, setNotifyFail] = useState(settings.notifyOnFailure)
  const [webhookUrl, setWebhookUrl] = useState(settings.webhookUrl ?? '')

  function save() {
    update({
      reviewThreshold: threshold,
      maxRetries: retries,
      notifyOnPublish: notifyPub,
      notifyOnFailure: notifyFail,
      webhookUrl: webhookUrl || undefined,
    })
    toast.success('Settings saved')
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-mono text-xl uppercase tracking-wider">Settings</h1>
        <p className="text-xs text-[var(--muted)] mt-1">
          Configure agent models and pipeline behavior.
        </p>
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="font-mono uppercase tracking-wider text-sm">Agent Models</h2>
          <p className="text-xs text-[var(--muted)] mt-1">
            Select the AI model each agent will use. Other agent settings are managed from the backend.
          </p>
        </div>

        {agents.map((a) => {
          const current =
            settings.agentModels[a.id] ?? a.defaultModel ?? DEFAULT_MODELS[0].id
          return (
            <Card key={a.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="font-mono uppercase tracking-widest text-xs text-[var(--muted)] mb-1">
                      ⬡ {a.name}
                    </div>
                    <p className="text-sm text-[var(--muted)] mb-3">{a.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <label className="text-xs font-mono uppercase tracking-wider text-[var(--muted)] w-16">
                    Model
                  </label>
                  <Select value={current} onValueChange={(v) => setAgentModel(a.id, v)}>
                    <SelectTrigger className="max-w-md">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {DEFAULT_MODELS.map((m) => (
                        <SelectItem key={m.id} value={m.id}>
                          {m.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>
          )
        })}
      </section>

      <section className="space-y-3">
        <h2 className="font-mono uppercase tracking-wider text-sm">Pipeline Behavior</h2>

        <Card>
          <CardContent className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm">Minimum review score to publish</label>
              <span className="font-mono text-[var(--accent)] text-sm">{threshold}</span>
            </div>
            <input
              type="range"
              min={1}
              max={9}
              value={threshold}
              onChange={(e) => setThreshold(parseInt(e.target.value, 10))}
              className="w-full accent-[var(--accent)]"
            />
            <div className="flex justify-between text-[10px] font-mono text-[var(--muted)]">
              <span>1 (lenient)</span>
              <span>9 (strict)</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4 flex items-center justify-between">
            <label className="text-sm">Max retries on failure</label>
            <Input
              type="number"
              min={0}
              max={10}
              value={retries}
              onChange={(e) => setRetries(parseInt(e.target.value, 10) || 0)}
              className="w-24"
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h2 className="font-mono uppercase tracking-wider text-sm">Notifications</h2>

        <Card>
          <CardContent className="p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={notifyPub} onCheckedChange={(v) => setNotifyPub(!!v)} />
              <span className="text-sm">Notify on publish</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox checked={notifyFail} onCheckedChange={(v) => setNotifyFail(!!v)} />
              <span className="text-sm">Notify on failure</span>
            </label>
            <div>
              <label className="section-label block mb-1">Webhook URL</label>
              <Input
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your.endpoint/hook"
              />
            </div>
          </CardContent>
        </Card>
      </section>

      <div className="pt-2">
        <Button onClick={save}>Save Changes</Button>
      </div>
    </div>
  )
}
