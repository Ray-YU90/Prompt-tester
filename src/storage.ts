// 人格任务存储：localStorage 持久化
import type { EvaluationResult } from './api'

export type HumanFeedback = {
  dimensionOverrides: Array<{
    name: string
    humanRating: '✅' | '⚠️' | '❌'
    reason: string
  }>
  overallComment: string
  createdAt: number
}

export type Evaluation = {
  id: string
  scenarioId: string // 预设场景 id；自定义场景为空
  scenarioName: string // 展示用
  scenarioContext: string // 评估时实际传给 LLM 的场景描述
  modelOutput: string
  extraNotes: string
  result: EvaluationResult
  humanFeedback?: HumanFeedback
  createdAt: number
}

export type Persona = {
  id: string
  name: string
  prompt: string
  judgingCriteria: string // AI 根据历史反馈生成的评判准则
  createdAt: number
  updatedAt: number
  evaluations: Evaluation[]
}

const STORAGE_KEY = 'prompt-tester-personas-v1'
const CURRENT_KEY = 'prompt-tester-current-persona'
const GEN_RULES_KEY = 'prompt-tester-gen-rules-v1'

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

// 全局累积的「生成人格 Prompt 额外规则」，按条存储，可独立编辑/删除
export function loadGenRules(): string[] {
  const raw = localStorage.getItem(GEN_RULES_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed)) return parsed.filter((s) => typeof s === 'string' && s.trim())
    // 旧版纯文本兼容：整块作为一条
    if (typeof parsed === 'string' && parsed.trim()) return [parsed.trim()]
  } catch {
    // 旧版不是 JSON，直接当作一整块
    if (raw.trim()) return [raw.trim()]
  }
  return []
}

export function saveGenRules(rules: string[]) {
  if (rules && rules.length) localStorage.setItem(GEN_RULES_KEY, JSON.stringify(rules))
  else localStorage.removeItem(GEN_RULES_KEY)
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

export function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}
