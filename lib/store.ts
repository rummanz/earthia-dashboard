'use client'
import { create } from 'zustand'
import type { ContentItem, PromptTemplate, AppSettings } from './types'
import { MOCK_CONTENT, MOCK_TEMPLATES, MOCK_SETTINGS } from './mock-data'
import { uid } from './utils'

interface ContentStore {
  items: ContentItem[]
  add: (item: ContentItem) => void
  remove: (id: string) => void
  update: (id: string, patch: Partial<ContentItem>) => void
}

export const useContentStore = create<ContentStore>((set) => ({
  items: MOCK_CONTENT,
  add: (item) => set((s) => ({ items: [item, ...s.items] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  update: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
}))

interface TemplateStore {
  templates: PromptTemplate[]
  add: (tpl: Omit<PromptTemplate, 'id' | 'createdAt' | 'updatedAt' | 'usageCount'>) => PromptTemplate
  update: (id: string, patch: Partial<PromptTemplate>) => void
  remove: (id: string) => void
}

export const useTemplateStore = create<TemplateStore>((set) => ({
  templates: MOCK_TEMPLATES,
  add: (tpl) => {
    const newTpl: PromptTemplate = {
      ...tpl,
      id: uid('tpl'),
      usageCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    set((s) => ({ templates: [newTpl, ...s.templates] }))
    return newTpl
  },
  update: (id, patch) =>
    set((s) => ({
      templates: s.templates.map((t) =>
        t.id === id ? { ...t, ...patch, updatedAt: new Date().toISOString() } : t
      ),
    })),
  remove: (id) => set((s) => ({ templates: s.templates.filter((t) => t.id !== id) })),
}))

interface SettingsStore {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  setAgentModel: (agentId: string, modelId: string) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: MOCK_SETTINGS,
  update: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
  setAgentModel: (agentId, modelId) =>
    set((s) => ({
      settings: {
        ...s.settings,
        agentModels: { ...s.settings.agentModels, [agentId]: modelId },
      },
    })),
}))

interface UIStore {
  addContentOpen: boolean
  setAddContentOpen: (v: boolean) => void
  shortcutHelpOpen: boolean
  setShortcutHelpOpen: (v: boolean) => void
}

export const useUIStore = create<UIStore>((set) => ({
  addContentOpen: false,
  setAddContentOpen: (v) => set({ addContentOpen: v }),
  shortcutHelpOpen: false,
  setShortcutHelpOpen: (v) => set({ shortcutHelpOpen: v }),
}))
