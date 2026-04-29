// SQL schema for Mission Control persistence (server-only).
// Migrations are idempotent (CREATE TABLE IF NOT EXISTS).

export const SCHEMA_SQL = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL DEFAULT 'queued',
  priority TEXT NOT NULL DEFAULT 'normal',
  assigned_agent_id TEXT,
  created_by_agent_id TEXT,
  workspace_id TEXT,
  business_id TEXT,
  due_date TEXT,
  workflow_template_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
CREATE INDEX IF NOT EXISTS idx_tasks_business ON tasks(business_id);
CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned ON tasks(assigned_agent_id);

CREATE TABLE IF NOT EXISTS agents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model TEXT,
  status TEXT NOT NULL DEFAULT 'idle',
  source TEXT NOT NULL DEFAULT 'local',
  gateway_agent_id TEXT,
  workspace_id TEXT,
  session_key_prefix TEXT,
  last_seen_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agents_gateway_id ON agents(gateway_agent_id) WHERE gateway_agent_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS openclaw_sessions (
  id TEXT PRIMARY KEY,
  openclaw_session_id TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  session_type TEXT NOT NULL DEFAULT 'main',
  status TEXT NOT NULL DEFAULT 'active',
  channel TEXT,
  started_at TEXT,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_oc_sessions_oc_id ON openclaw_sessions(openclaw_session_id);
CREATE INDEX IF NOT EXISTS idx_oc_sessions_agent ON openclaw_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_oc_sessions_task ON openclaw_sessions(task_id);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  agent_id TEXT,
  task_id TEXT,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_created_at ON events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_type ON events(type);
CREATE INDEX IF NOT EXISTS idx_events_task ON events(task_id);

CREATE TABLE IF NOT EXISTS task_activities (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  agent_id TEXT,
  activity_type TEXT NOT NULL,
  message TEXT NOT NULL,
  metadata TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_activities_task ON task_activities(task_id);
CREATE INDEX IF NOT EXISTS idx_activities_created ON task_activities(created_at DESC);

CREATE TABLE IF NOT EXISTS task_deliverables (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  deliverable_type TEXT NOT NULL,
  title TEXT NOT NULL,
  path TEXT,
  description TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_deliverables_task ON task_deliverables(task_id);

CREATE TABLE IF NOT EXISTS task_roles (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  role TEXT NOT NULL,
  agent_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_task_roles_task ON task_roles(task_id);

CREATE TABLE IF NOT EXISTS planning_questions (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  question TEXT NOT NULL,
  answer TEXT,
  asked_at TEXT NOT NULL,
  answered_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_planning_questions_task ON planning_questions(task_id);

CREATE TABLE IF NOT EXISTS planning_specs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL,
  spec TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_planning_specs_task ON planning_specs(task_id);
`
