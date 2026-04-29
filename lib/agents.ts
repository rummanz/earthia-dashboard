import fs from 'fs'
import path from 'path'
import matter from 'gray-matter'

const AGENTS_DIR = path.join(process.cwd(), 'agents')

export interface AgentMeta {
  id: string
  name: string
  role: string
  description: string
  capabilities: string[]
  model?: string
  status?: 'idle' | 'running' | 'error'
  content: string
}

const FILES = [
  'coordinator.md',
  'prompt-engineer.md',
  'content-creator.md',
  'reviewer.md',
  'publisher.md',
]

export function loadAgent(filename: string): AgentMeta | null {
  try {
    const filepath = path.join(AGENTS_DIR, filename)
    const raw = fs.readFileSync(filepath, 'utf-8')
    const { data, content } = matter(raw)
    return {
      id: String(data.id ?? filename.replace('.md', '')),
      name: String(data.name ?? ''),
      role: String(data.role ?? ''),
      description: String(data.description ?? ''),
      capabilities: Array.isArray(data.capabilities) ? data.capabilities.map(String) : [],
      model: data.model ? String(data.model) : undefined,
      content,
    }
  } catch {
    return null
  }
}

export function loadAllAgents(): AgentMeta[] {
  return FILES.map(loadAgent).filter((a): a is AgentMeta => a !== null)
}
