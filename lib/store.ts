'use client'
import { create } from 'zustand'
import type { ContentItem, PromptTemplate, AppSettings } from './types'

// Default settings live here so the store has no dependency on `lib/mock-data`.
// Real settings will come from /api/settings once that route exists.
const DEFAULT_SETTINGS: AppSettings = {
  agentModels: {},
  reviewThreshold: 6,
  maxRetries: 3,
  notifyOnPublish: false,
  notifyOnFailure: true,
}

// NOTE: Content and prompt-template stores are NOT seeded with mock data.
// They start empty and the source of truth is the SQLite-backed API. The
// stores remain available as a UI convenience for components that want to
// keep optimistic state, but the dashboard reads directly from React Query
// (`/api/tasks`, `/api/prompts`).

interface ContentStore {
  items: ContentItem[]
  set: (items: ContentItem[]) => void
  add: (item: ContentItem) => void
  remove: (id: string) => void
  update: (id: string, patch: Partial<ContentItem>) => void
}

export const useContentStore = create<ContentStore>((set) => ({
  items: [],
  set: (items) => set({ items }),
  add: (item) => set((s) => ({ items: [item, ...s.items] })),
  remove: (id) => set((s) => ({ items: s.items.filter((i) => i.id !== id) })),
  update: (id, patch) =>
    set((s) => ({
      items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)),
    })),
}))

interface TemplateStore {
  templates: PromptTemplate[]
  set: (templates: PromptTemplate[]) => void
}

export const useTemplateStore = create<TemplateStore>((set) => ({
  templates: [],
  set: (templates) => set({ templates }),
}))

interface SettingsStore {
  settings: AppSettings
  update: (patch: Partial<AppSettings>) => void
  setAgentModel: (agentId: string, modelId: string) => void
}

export const useSettingsStore = create<SettingsStore>((set) => ({
  settings: DEFAULT_SETTINGS,
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
