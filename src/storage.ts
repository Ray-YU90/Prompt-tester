// 人格任务存储：localStorage 持久化
import type { EvaluationResult } from './api'

export type Evaluation = {
  id: string
  scenarioId: string // 预设场景 id；自定义场景为空
  scenarioName: string // 展示用
  scenarioContext: string // 评估时实际传给 LLM 的场景描述
  modelOutput: string
  extraNotes: string
  result: EvaluationResult
  createdAt: number
}

export type Persona = {
  id: string
  name: string
  prompt: string
  createdAt: number
  updatedAt: number
  evaluations: Evaluation[]
}

const STORAGE_KEY = 'prompt-tester-personas-v1'
const CURRENT_KEY = 'prompt-tester-current-persona'

export function loadPersonas(): Persona[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as Persona[]
  } catch {
    return []
  }
}

export function savePersonas(personas: Persona[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(personas))
}

export function loadCurrentPersonaId(): string {
  return localStorage.getItem(CURRENT_KEY) || ''
}

export function saveCurrentPersonaId(id: string) {
  if (id) localStorage.setItem(CURRENT_KEY, id)
  else localStorage.removeItem(CURRENT_KEY)
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
