// Intentionally empty.
//
// The dashboard used to ship with seeded mock content / templates / settings
// here. They were a development convenience and they have been removed: the
// app now starts with a clean slate and fills only as the user creates real
// tasks and prompt templates against the API.
//
// We keep this file present (instead of deleting it) so that any stray import
// during refactors fails loudly via TypeScript rather than silently picking up
// a stale fixture. Add real defaults in the database, not here.

import type {
  AppSettings,
  ContentItem,
  PromptTemplate,
} from './types'

export const MOCK_TEMPLATES: PromptTemplate[] = []
export const MOCK_CONTENT: ContentItem[] = []
export const MOCK_SETTINGS: AppSettings = {
  agentModels: {},
  reviewThreshold: 6,
  maxRetries: 3,
  notifyOnPublish: false,
  notifyOnFailure: true,
}
