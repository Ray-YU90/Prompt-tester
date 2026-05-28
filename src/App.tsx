import { useState, useEffect, useMemo } from 'react'
import { SCENARIOS, CATEGORIES, type Scenario } from './scenarios'
import { evaluatePrompt, updateJudgingCriteria, generatePersonaPrompt, extractOneRule, EVALUATION_SYSTEM_PROMPT, type EvaluationResult, type LLMConfig, type HumanFeedbackInput } from './api'
import {
  type Persona,
  type Evaluation,
  type HumanFeedback,
  loadPersonas,
  savePersonas,
  loadCurrentPersonaId,
  saveCurrentPersonaId,
  loadGenRules,
  saveGenRules,
  genId,
  formatTime,
} from './storage'

const PRESET_PROVIDERS = [
  { name: 'DeepSeek（便宜，推荐）', baseURL: 'https://api.deepseek.com/v1', model: 'deepseek-chat' },
  { name: '通义千问 DashScope', baseURL: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  { name: '智谱 GLM', baseURL: 'https://open.bigmodel.cn/api/paas/v4', model: 'glm-4-plus' },
  { name: 'OpenAI', baseURL: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  { name: '自定义', baseURL: '', model: '' },
]

const CONFIG_KEY = 'prompt-tester-llm-config-v1'

function App() {
  // ------ LLM Config (per-user) ------
  const [config, setConfig] = useState<LLMConfig>({
    baseURL: PRESET_PROVIDERS[0].baseURL,
    apiKey: '',
    model: PRESET_PROVIDERS[0].model,
  })
  const [providerIdx, setProviderIdx] = useState(0)
  const [showSettings, setShowSettings] = useState(false)

  // ------ Personas ------
  const [personas, setPersonas] = useState<Persona[]>([])
  const [currentPersonaId, setCurrentPersonaId] = useState('')
  const [showPersonaModal, setShowPersonaModal] = useState(false)
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null)

  // ------ Inputs ------
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>('')
  const [customScenario, setCustomScenario] = useState('')
  const [modelOutput, setModelOutput] = useState('')
  const [extraNotes, setExtraNotes] = useState('')

  // ------ Eval state ------
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState<EvaluationResult | null>(null)
  const [copiedId, setCopiedId] = useState('')
  const [viewingEval, setViewingEval] = useState<Evaluation | null>(null)
  const [showCriteriaModal, setShowCriteriaModal] = useState(false)

  // ------ 全局生成人格额外规则 ------
  const [genRules, setGenRules] = useState<string[]>([])
  const [showGenRulesModal, setShowGenRulesModal] = useState(false)
  const [genRulesUpdating, setGenRulesUpdating] = useState(false)
  const [recordedFlash, setRecordedFlash] = useState(false)

  // 初始化
  useEffect(() => {
    // 加载用户的 LLM 配置
    try {
      const raw = localStorage.getItem(CONFIG_KEY)
      if (raw) {
        const data = JSON.parse(raw)
        if (data.config) setConfig(data.config)
        if (typeof data.providerIdx === 'number') setProviderIdx(data.providerIdx)
      }
    } catch {}

    const list = loadPersonas()
    setPersonas(list)
    const cid = loadCurrentPersonaId()
    if (cid && list.some((p) => p.id === cid)) {
      setCurrentPersonaId(cid)
    } else if (list.length === 0) {
      setShowPersonaModal(true)
    } else {
      setCurrentPersonaId(list[0].id)
    }

    setGenRules(loadGenRules())
  }, [])

  // 持久化
  useEffect(() => {
    savePersonas(personas)
  }, [personas])

  useEffect(() => {
    saveCurrentPersonaId(currentPersonaId)
  }, [currentPersonaId])

  useEffect(() => {
    saveGenRules(genRules)
  }, [genRules])

  useEffect(() => {
    localStorage.setItem(CONFIG_KEY, JSON.stringify({ config, providerIdx }))
  }, [config, providerIdx])

  const handleProviderChange = (idx: number) => {
    setProviderIdx(idx)
    const preset = PRESET_PROVIDERS[idx]
    if (preset.baseURL) {
      setConfig((c) => ({ ...c, baseURL: preset.baseURL, model: preset.model }))
    }
  }

  const currentPersona = useMemo(
    () => personas.find((p) => p.id === currentPersonaId) || null,
    [personas, currentPersonaId]
  )

  const scenariosByCategory = useMemo(() => {
    const map: Record<string, Scenario[]> = {}
    for (const cat of CATEGORIES) map[cat] = []
    for (const s of SCENARIOS) map[s.category].push(s)
    return map
  }, [])

  const currentScenario = useMemo(
    () => SCENARIOS.find((s) => s.id === selectedScenarioId),
    [selectedScenarioId]
  )

  const scenarioContext = useMemo(() => {
    if (currentScenario) {
      return `场景：${currentScenario.name}\n场景描述：${currentScenario.description}\n原始系统文案（重写前）：${currentScenario.originalText}`
    }
    if (customScenario.trim()) return `自定义场景：${customScenario}`
    return ''
  }, [currentScenario, customScenario])

  const copyOriginal = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(''), 1500)
  }

  // 更新当前人格 prompt（编辑时）
  const updateCurrentPrompt = (newPrompt: string) => {
    if (!currentPersona) return
    setPersonas((list) =>
      list.map((p) =>
        p.id === currentPersona.id ? { ...p, prompt: newPrompt, updatedAt: Date.now() } : p
      )
    )
  }

  // 保存/新建人格
  const handleSavePersona = (name: string, prompt: string) => {
    const trimmedName = name.trim()
    const trimmedPrompt = prompt.trim()
    if (!trimmedName || !trimmedPrompt) return
    if (editingPersona) {
      setPersonas((list) =>
        list.map((p) =>
          p.id === editingPersona.id
            ? { ...p, name: trimmedName, prompt: trimmedPrompt, updatedAt: Date.now() }
            : p
        )
      )
    } else {
      const np: Persona = {
        id: genId(),
        name: trimmedName,
        prompt: trimmedPrompt,
        judgingCriteria: '',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        evaluations: [],
      }
      setPersonas((list) => [...list, np])
      setCurrentPersonaId(np.id)
    }
    setShowPersonaModal(false)
    setEditingPersona(null)
  }

  const handleDeletePersona = (id: string) => {
    if (!confirm('确定删除这个人格任务？所有测试记录会一起被清掉。')) return
    setPersonas((list) => list.filter((p) => p.id !== id))
    if (currentPersonaId === id) {
      const remain = personas.filter((p) => p.id !== id)
      setCurrentPersonaId(remain[0]?.id || '')
      if (remain.length === 0) setShowPersonaModal(true)
    }
  }

  const handleEvaluate = async () => {
    setError('')
    setResult(null)
    setViewingEval(null)

    if (!currentPersona) return setError('请先创建或选择一个人格任务')
    if (!config.apiKey.trim()) {
      setError('请先在右上角「⚙️ 设置」中填入 API Key')
      setShowSettings(true)
      return
    }
    if (!currentPersona.prompt.trim()) return setError('当前人格的 Prompt 为空，请先编辑')
    if (!modelOutput.trim()) return setError('请填写模型输出')
    if (!scenarioContext) return setError('请选择场景或填写自定义场景描述')

    setLoading(true)
    try {
      const r = await evaluatePrompt(
        config,
        currentPersona.prompt,
        scenarioContext,
        modelOutput,
        extraNotes,
        currentPersona.judgingCriteria
      )
      setResult(r)
      // 保存到当前人格的评估记录
      const evalRecord: Evaluation = {
        id: genId(),
        scenarioId: currentScenario?.id || '',
        scenarioName: currentScenario?.name || (customScenario.slice(0, 20) + '...'),
        scenarioContext,
        modelOutput,
        extraNotes,
        result: r,
        createdAt: Date.now(),
      }
      setPersonas((list) =>
        list.map((p) =>
          p.id === currentPersona.id
            ? { ...p, evaluations: [evalRecord, ...p.evaluations], updatedAt: Date.now() }
            : p
        )
      )
    } catch (e: any) {
      setError(e.message || String(e))
    } finally {
      setLoading(false)
    }
  }

  // 查看历史评估
  const handleViewEvaluation = (ev: Evaluation) => {
    setViewingEval(ev)
    setResult(ev.result)
  }

  const handleDeleteEvaluation = (evId: string) => {
    if (!currentPersona) return
    if (!confirm('删除这条测试记录？')) return
    setPersonas((list) =>
      list.map((p) =>
        p.id === currentPersona.id
          ? { ...p, evaluations: p.evaluations.filter((e) => e.id !== evId) }
          : p
      )
    )
    if (viewingEval?.id === evId) {
      setViewingEval(null)
      setResult(null)
    }
  }

  const fillScenarioToOutput = () => {
    if (currentScenario) setModelOutput(currentScenario.originalText)
  }

  // 把 AI 评估结果中的问题点拼为反馈总结
  const buildAiFeedbackSummary = (
    r: EvaluationResult,
    personaLabel: string,
    scenarioLabel: string
  ): string => {
    const badDims = r.dimensions.filter((d) => d.rating !== '✅')
    const lines: string[] = []
    lines.push(`【反馈来源】AI 自动评估（人格：${personaLabel}、场景：${scenarioLabel}）`)
    lines.push(`【总体判定】${r.verdict}（${r.overallScore} 分）：${r.verdictReason}`)
    if (badDims.length) {
      lines.push('【问题维度】')
      badDims.forEach((d) => lines.push(`- ${d.rating} ${d.name}：${d.comment}`))
    }
    if (r.coreIssues.length) {
      lines.push('【核心问题】')
      r.coreIssues.forEach((s) => lines.push(`- ${s}`))
    }
    if (r.suggestions.length) {
      lines.push('【改进建议】')
      r.suggestions.forEach((s) => lines.push(`- ${s}`))
    }
    return lines.join('\n')
  }

  // 手动记录当前评估到生成规则（用户点击「📥 记录到生成规则」按钮触发）
  const handleRecordToRules = async (): Promise<void> => {
    if (!currentPersona) return
    if (!result) return
    if (!config.apiKey?.trim()) {
      alert('请先在「⚙️ 设置」中填入 API Key')
      return
    }

    const personaLabel = currentPersona.name
    const scenarioLabel =
      viewingEval?.scenarioName ||
      currentScenario?.name ||
      customScenario.slice(0, 20) ||
      '(未命名场景)'
    const sections: string[] = []
    sections.push(buildAiFeedbackSummary(result, personaLabel, scenarioLabel))

    // 取当前评估的人工反馈（如果有）
    const targetEval = viewingEval || currentPersona.evaluations[0]
    const hf = targetEval?.humanFeedback
    if (hf && (hf.dimensionOverrides.length || hf.overallComment?.trim())) {
      const lines: string[] = []
      lines.push(`【反馈来源】人工反馈（人格：${personaLabel}）`)
      if (hf.dimensionOverrides.length) {
        lines.push('【人工覆盖】')
        hf.dimensionOverrides.forEach((d) =>
          lines.push(`- ${d.name}：人工=${d.humanRating}；理由：${d.reason || '（未填）'}`)
        )
      }
      if (hf.overallComment?.trim()) lines.push(`【总体备注】${hf.overallComment.trim()}`)
      sections.push(lines.join('\n'))
    }

    setGenRulesUpdating(true)
    try {
      const newRule = await extractOneRule(
        config,
        genRules,
        sections.join('\n\n')
      )
      if (!newRule) {
        alert('本次反馈未提炼出新规则（与现有规则重复或无新代价）。')
      } else {
        setGenRules((prev) => [...prev, newRule])
        setRecordedFlash(true)
        setTimeout(() => setRecordedFlash(false), 2000)
      }
    } catch (e: any) {
      alert('记录失败：' + (e?.message || e))
    } finally {
      setGenRulesUpdating(false)
    }
  }

  // 提交人工反馈 → 更新评判标准（不再自动累积生成规则，改为手动点击「记录」按钮）
  const handleSubmitFeedback = async (feedback: HumanFeedbackInput): Promise<void> => {
    if (!currentPersona) return
    // 1. 调 AI 更新 judgingCriteria
    const newCriteria = await updateJudgingCriteria(
      config,
      currentPersona.judgingCriteria || '',
      feedback
    )
    // 2. 保存 humanFeedback 到最新的 evaluation
    const humanFb: HumanFeedback = {
      dimensionOverrides: feedback.dimensionOverrides.map((d) => ({
        name: d.name,
        humanRating: d.humanRating,
        reason: d.reason,
      })),
      overallComment: feedback.overallComment,
      createdAt: Date.now(),
    }
    // 3. 更新 persona（criteria + evaluation feedback）
    setPersonas((list) =>
      list.map((p) => {
        if (p.id !== currentPersona.id) return p
        const evals = [...p.evaluations]
        // 给最新那条（或正在查看的那条）加 humanFeedback
        const targetId = viewingEval?.id || evals[0]?.id
        const idx = evals.findIndex((e) => e.id === targetId)
        if (idx >= 0) evals[idx] = { ...evals[idx], humanFeedback: humanFb }
        return { ...p, judgingCriteria: newCriteria, evaluations: evals, updatedAt: Date.now() }
      })
    )
  }

  return (
    <div className="app">
      <header className="header">
        <div className="brand">
          <h1>🧪 Prompt Tester</h1>
          <span className="subtitle">人格调试台 · 评估模型输出是否符合 Prompt 设定</span>
        </div>
        <div className="header-actions">
          <span className={`badge ${config.apiKey ? 'ready' : 'warn'}`}>
            {config.apiKey ? '✅ 已配置 API' : '⚠️ 未配置 API'}
          </span>
          <button className="btn-ghost" onClick={() => setShowSettings(true)}>
            ⚙️ 设置
          </button>
        </div>
      </header>

      <PersonaBar
        personas={personas}
        currentId={currentPersonaId}
        onSwitch={(id) => {
          setCurrentPersonaId(id)
          setResult(null)
          setViewingEval(null)
        }}
        onCreate={() => {
          setEditingPersona(null)
          setShowPersonaModal(true)
        }}
        onEdit={(p) => {
          setEditingPersona(p)
          setShowPersonaModal(true)
        }}
        onDelete={handleDeletePersona}
      />

      {!currentPersona ? (
        <div className="empty-state">
          <div className="empty-icon">👋</div>
          <h2>先创建一个人格任务开始测试</h2>
          <p>每个人格任务对应一个 Prompt，所有场景下的测试结果会被记录在该任务下</p>
          <button className="btn-primary" onClick={() => setShowPersonaModal(true)}>
            ➕ 新建人格任务
          </button>
        </div>
      ) : (
        <main className="main">
          <section className="left">
            <div className="card">
              <div className="card-head">
                <h3>① 当前人格 Prompt</h3>
                <span className="muted-tag">{currentPersona.name}</span>
              </div>
              <textarea
                className="textarea-tall"
                value={currentPersona.prompt}
                onChange={(e) => updateCurrentPrompt(e.target.value)}
                placeholder="该人格的 prompt..."
              />
              <div className="hint">
                💡 编辑会自动保存到当前人格。如要测试不同 prompt，请新建另一个人格任务。
              </div>
            </div>

            <div className="card">
              <h3>② 测试场景</h3>
              <div className="scenarios">
                {CATEGORIES.map((cat) => (
                  <div key={cat} className="scenario-group">
                    <div className="cat-label">{cat}</div>
                    <div className="chips">
                      {scenariosByCategory[cat].map((s) => (
                        <button
                          key={s.id}
                          className={`chip ${selectedScenarioId === s.id ? 'active' : ''}`}
                          onClick={() => {
                            setSelectedScenarioId(s.id)
                            setCustomScenario('')
                          }}
                        >
                          {s.name}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
              {currentScenario && (
                <div className="scenario-detail">
                  <div className="scenario-meta">
                    <strong>原始文案：</strong>
                    <span>{currentScenario.originalText}</span>
                    <button
                      className="copy-btn"
                      title="复制原始文案"
                      onClick={() =>
                        copyOriginal(currentScenario.originalText, currentScenario.id)
                      }
                    >
                      {copiedId === currentScenario.id ? '✅ 已复制' : '📋 复制'}
                    </button>
                  </div>
                  <div className="scenario-meta">
                    <strong>场景说明：</strong>
                    <span>{currentScenario.description}</span>
                  </div>
                </div>
              )}
              <details className="custom-toggle">
                <summary>或填写自定义场景</summary>
                <textarea
                  className="textarea-short"
                  value={customScenario}
                  onChange={(e) => {
                    setCustomScenario(e.target.value)
                    if (e.target.value) setSelectedScenarioId('')
                  }}
                  placeholder="例如：用户连续问了3次为什么不能退款，已经表现出明显不耐烦..."
                />
              </details>
            </div>

            <div className="card">
              <div className="card-head">
                <h3>③ 模型实际输出</h3>
                {currentScenario && (
                  <button className="btn-ghost-sm" onClick={fillScenarioToOutput}>
                    填入原始文案
                  </button>
                )}
              </div>
              <textarea
                className="textarea-tall"
                value={modelOutput}
                onChange={(e) => setModelOutput(e.target.value)}
                placeholder="贴入你在其他模型中调试得到的实际回复..."
              />
            </div>

            <div className="card">
              <h3>④ 额外要求（可选）</h3>
              <textarea
                className="textarea-short"
                value={extraNotes}
                onChange={(e) => setExtraNotes(e.target.value)}
                placeholder="任何特殊关注点，例如：希望强化俏皮感、避免出现某个词等..."
              />
            </div>

            <button className="btn-primary" onClick={handleEvaluate} disabled={loading}>
              {loading ? '⏳ AI 评估中...' : '🚀 开始评估并记录'}
            </button>
            {error && <div className="error">⚠️ {error}</div>}

            <HistoryPanel
              persona={currentPersona}
              activeEvalId={viewingEval?.id || ''}
              onView={handleViewEvaluation}
              onDelete={handleDeleteEvaluation}
            />
          </section>

          <section className="right">
            {!result && !loading && (
              <div className="empty">
                <div className="empty-icon">📋</div>
                <div>填好左侧内容后点击「开始评估」</div>
                <div className="empty-hint">
                  AI 将从 5 个维度判断输出是否符合 Prompt 设定
                </div>
              </div>
            )}
            {loading && (
              <div className="empty">
                <div className="empty-icon">⏳</div>
                <div>正在评估中，通常需要 5-15 秒...</div>
              </div>
            )}
            {result && (
              <ResultPanel
                result={result}
                viewingEval={viewingEval}
                onUseOptimized={(p) => updateCurrentPrompt(p)}
                onSubmitFeedback={handleSubmitFeedback}
                onShowCriteria={() => setShowCriteriaModal(true)}
                onRecordToRules={handleRecordToRules}
                recording={genRulesUpdating}
                recordedFlash={recordedFlash}
              />
            )}
          </section>
        </main>
      )}

      {showPersonaModal && (
        <PersonaModal
          editing={editingPersona}
          config={config}
          extraGenRules={genRules}
          genRulesUpdating={genRulesUpdating}
          onShowGenRules={() => setShowGenRulesModal(true)}
          onSave={handleSavePersona}
          onCancel={() => {
            setShowPersonaModal(false)
            setEditingPersona(null)
          }}
        />
      )}

      {showSettings && (
        <SettingsModal
          config={config}
          providerIdx={providerIdx}
          onChangeProvider={handleProviderChange}
          onChangeConfig={setConfig}
          onClose={() => setShowSettings(false)}
        />
      )}

      {showCriteriaModal && (
        <CriteriaModal
          defaultCriteria={EVALUATION_SYSTEM_PROMPT}
          customCriteria={currentPersona?.judgingCriteria || ''}
          onSave={(text) => {
            if (!currentPersona) return
            setPersonas((list) =>
              list.map((p) =>
                p.id === currentPersona.id
                  ? { ...p, judgingCriteria: text, updatedAt: Date.now() }
                  : p
              )
            )
          }}
          onClose={() => setShowCriteriaModal(false)}
        />
      )}

      {showGenRulesModal && (
        <GenRulesModal
          rules={genRules}
          updating={genRulesUpdating}
          onUpdate={(idx, text) => {
            const t = text.trim()
            if (!t) {
              setGenRules((prev) => prev.filter((_, i) => i !== idx))
            } else {
              setGenRules((prev) => prev.map((r, i) => (i === idx ? t : r)))
            }
          }}
          onDelete={(idx) => setGenRules((prev) => prev.filter((_, i) => i !== idx))}
          onClear={() => {
            if (confirm('确定清空所有累积的生成人格额外规则？清空后不可恢复。')) setGenRules([])
          }}
          onClose={() => setShowGenRulesModal(false)}
        />
      )}
    </div>
  )
}

// ========== Persona Bar ==========
function PersonaBar({
  personas,
  currentId,
  onSwitch,
  onCreate,
  onEdit,
  onDelete,
}: {
  personas: Persona[]
  currentId: string
  onSwitch: (id: string) => void
  onCreate: () => void
  onEdit: (p: Persona) => void
  onDelete: (id: string) => void
}) {
  const current = personas.find((p) => p.id === currentId)
  return (
    <div className="persona-bar">
      <div className="persona-tabs">
        {personas.map((p) => (
          <button
            key={p.id}
            className={`persona-tab ${p.id === currentId ? 'active' : ''}`}
            onClick={() => onSwitch(p.id)}
          >
            <span className="persona-tab-name">{p.name}</span>
            <span className="persona-tab-count">{p.evaluations.length}</span>
          </button>
        ))}
        <button className="persona-tab-add" onClick={onCreate} title="新建人格">
          ➕
        </button>
      </div>
      {current && (
        <div className="persona-actions">
          <button className="btn-ghost-sm" onClick={() => onEdit(current)}>
            ✏️ 改名
          </button>
          <button className="btn-ghost-sm danger" onClick={() => onDelete(current.id)}>
            🗑 删除
          </button>
        </div>
      )}
    </div>
  )
}

// ========== Persona Modal ==========
function PersonaModal({
  editing,
  config,
  extraGenRules,
  genRulesUpdating,
  onShowGenRules,
  onSave,
  onCancel,
}: {
  editing: Persona | null
  config: LLMConfig
  extraGenRules: string[]
  genRulesUpdating: boolean
  onShowGenRules: () => void
  onSave: (name: string, prompt: string) => void
  onCancel: () => void
}) {
  const [name, setName] = useState(editing?.name || '')
  const [prompt, setPrompt] = useState(editing?.prompt || '')
  const [styleHint, setStyleHint] = useState('')
  const [generating, setGenerating] = useState(false)
  const [genError, setGenError] = useState('')

  const handleGenerate = async () => {
    if (!config.apiKey) {
      setGenError('请先在「⚙️ 设置」中配置 API Key')
      return
    }
    setGenError('')
    setGenerating(true)
    try {
      const generated = await generatePersonaPrompt(config, name.trim(), styleHint.trim(), extraGenRules)
      setPrompt(generated)
    } catch (e: any) {
      setGenError(e?.message || '生成失败')
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="modal-mask" onClick={onCancel}>
      <div className="modal persona-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{editing ? '编辑人格任务' : '新建人格任务'}</h3>
        <div className="modal-row">
          <label>人格名称</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：灵光风趣 v1 / 轻松自然 / 客服腔"
            autoFocus
          />
        </div>
        <div className="modal-row">
          <label>风格描述（可选，用于 AI 生成）</label>
          <input
            type="text"
            value={styleHint}
            onChange={(e) => setStyleHint(e.target.value)}
            placeholder="例如：冷淡精炼 / 温柔治愈系 / 酷盖少年语气"
          />
        </div>
        <div className="modal-row">
          <div className="label-row">
            <label>人格 Prompt</label>
            <button
              className="btn-primary-sm"
              onClick={handleGenerate}
              disabled={generating}
              type="button"
            >
              {generating ? '生成中...' : '✨ 生成人格 Prompt'}
            </button>
          </div>
          <div className="gen-rules-tip">
            已累积 <b>{extraGenRules.length}</b> 条「生成额外规则」
            {genRulesUpdating && <span className="updating-tag">更新中...</span>}
            <button type="button" className="btn-link" onClick={onShowGenRules}>查看/管理</button>
          </div>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="贴入这个人格的完整 system prompt，或点击上方按钮由 AI 自动生成..."
            rows={14}
          />
          {genError && <div className="gen-error">⚠️ {genError}</div>}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn-primary"
            onClick={() => onSave(name, prompt)}
            disabled={!name.trim() || !prompt.trim()}
          >
            {editing ? '保存' : '创建并使用'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== Settings Modal ==========
function SettingsModal({
  config,
  providerIdx,
  onChangeProvider,
  onChangeConfig,
  onClose,
}: {
  config: LLMConfig
  providerIdx: number
  onChangeProvider: (idx: number) => void
  onChangeConfig: (c: LLMConfig) => void
  onClose: () => void
}) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>⚙️ API 设置</h3>
        <div className="modal-row">
          <label>服务商</label>
          <select
            value={providerIdx}
            onChange={(e) => onChangeProvider(Number(e.target.value))}
          >
            {PRESET_PROVIDERS.map((p, i) => (
              <option key={i} value={i}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-row">
          <label>Base URL</label>
          <input
            type="text"
            value={config.baseURL}
            onChange={(e) => onChangeConfig({ ...config, baseURL: e.target.value })}
            placeholder="https://api.deepseek.com/v1"
          />
        </div>
        <div className="modal-row">
          <label>API Key</label>
          <input
            type="password"
            value={config.apiKey}
            onChange={(e) => onChangeConfig({ ...config, apiKey: e.target.value })}
            placeholder="sk-..."
            autoFocus={!config.apiKey}
          />
        </div>
        <div className="modal-row">
          <label>Model</label>
          <input
            type="text"
            value={config.model}
            onChange={(e) => onChangeConfig({ ...config, model: e.target.value })}
            placeholder="deepseek-chat / qwen-plus / gpt-4o-mini"
          />
        </div>
        <div className="hint">
          🔒 配置仅保存在你的浏览器 localStorage，不会上传服务器。如果你还没有 API Key：<br/>
          · DeepSeek（推荐，便宜）：<a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noreferrer">platform.deepseek.com</a>
        </div>
        <div className="modal-actions">
          <button className="btn-primary" onClick={onClose}>
            完成
          </button>
        </div>
      </div>
    </div>
  )
}

// ========== History Panel ==========
function HistoryPanel({
  persona,
  activeEvalId,
  onView,
  onDelete,
}: {
  persona: Persona
  activeEvalId: string
  onView: (e: Evaluation) => void
  onDelete: (id: string) => void
}) {
  // 按场景聚合
  const grouped = useMemo(() => {
    const m: Record<string, Evaluation[]> = {}
    for (const e of persona.evaluations) {
      const key = e.scenarioName || '自定义场景'
      ;(m[key] = m[key] || []).push(e)
    }
    return m
  }, [persona.evaluations])

  if (persona.evaluations.length === 0) {
    return (
      <div className="card history-empty">
        <h3>📜 测试记录（{persona.name}）</h3>
        <div className="empty-hint" style={{ padding: '12px 0' }}>
          还没有评估记录，下次评估会自动保存到这里
        </div>
      </div>
    )
  }

  return (
    <div className="card">
      <h3>
        📜 测试记录（共 {persona.evaluations.length} 条 · {Object.keys(grouped).length} 个场景）
      </h3>
      <div className="history-list">
        {Object.entries(grouped).map(([scene, evs]) => (
          <div key={scene} className="history-group">
            <div className="history-scene">{scene}</div>
            {evs.map((e) => (
              <div
                key={e.id}
                className={`history-item ${e.id === activeEvalId ? 'active' : ''}`}
                onClick={() => onView(e)}
              >
                <span
                  className={`history-score ${e.result.verdict === '及格' ? 'pass' : 'fail'}`}
                >
                  {e.result.overallScore}
                </span>
                <span className="history-time">{formatTime(e.createdAt)}</span>
                <span className="history-snippet">{e.modelOutput.slice(0, 30)}...</span>
                <button
                  className="history-del"
                  onClick={(ev) => {
                    ev.stopPropagation()
                    onDelete(e.id)
                  }}
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ========== Result Panel ==========
function ResultPanel({
  result,
  viewingEval,
  onUseOptimized,
  onSubmitFeedback,
  onShowCriteria,
  onRecordToRules,
  recording,
  recordedFlash,
}: {
  result: EvaluationResult
  viewingEval: Evaluation | null
  onUseOptimized: (p: string) => void
  onSubmitFeedback: (feedback: HumanFeedbackInput) => Promise<void>
  onShowCriteria: () => void
  onRecordToRules: () => Promise<void>
  recording: boolean
  recordedFlash: boolean
}) {
  return (
    <div className="result">
      <div className="result-toolbar">
        <button
          className={`btn-ghost ${recordedFlash ? 'recorded' : ''}`}
          onClick={onRecordToRules}
          disabled={recording}
          title="手动把本次评估中的问题与改进点记录到『生成人格 Prompt 额外规则』中"
        >
          {recording ? '记录中...' : recordedFlash ? '✅ 已记录' : '📥 记录到生成规则'}
        </button>
        <button className="btn-ghost" onClick={onShowCriteria}>
          📐 查看评判标准
        </button>
      </div>
      {viewingEval && (
        <div className="viewing-banner">
          📜 正在查看历史记录 · {viewingEval.scenarioName} ·{' '}
          {formatTime(viewingEval.createdAt)}
        </div>
      )}

      <div className={`card score-card ${result.verdict === '及格' ? 'pass' : 'fail'}`}>
        <div className="score-main">
          <div className="score-num">{result.overallScore}</div>
          <div className="score-meta">
            <div className="score-label">总分 / 100</div>
            <div className={`verdict-tag ${result.verdict === '及格' ? 'pass' : 'fail'}`}>
              {result.verdict === '及格' ? '✅ 及格' : '❌ 不及格'}
            </div>
          </div>
        </div>
        <div className="verdict-reason">{result.verdictReason}</div>
      </div>

      <div className="card">
        <h3>📋 Prompt 意图摘要</h3>
        <div className="kv">
          <span className="k">角色</span>
          <span className="v">{result.summary.role}</span>
        </div>
        <div className="kv">
          <span className="k">目标</span>
          <span className="v">{result.summary.goal}</span>
        </div>
        <div className="kv">
          <span className="k">约束</span>
          <span className="v">{result.summary.constraints}</span>
        </div>
      </div>

      <div className="card">
        <h3>🎯 五维评估</h3>
        <table className="dim-table">
          <thead>
            <tr>
              <th>维度</th>
              <th>评级</th>
              <th>说明</th>
            </tr>
          </thead>
          <tbody>
            {result.dimensions.map((d, i) => (
              <tr key={i}>
                <td className="dim-name">{d.name}</td>
                <td className={`rating r-${d.rating}`}>{d.rating}</td>
                <td className="comment">{d.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card highlight">
        <div className="card-head">
          <h3>🔧 分析与优化</h3>
          <div className="actions">
            <button
              className="btn-ghost-sm"
              onClick={() => navigator.clipboard.writeText(result.optimizedPrompt)}
            >
              复制 Prompt
            </button>
            <button
              className="btn-primary-sm"
              onClick={() => onUseOptimized(result.optimizedPrompt)}
            >
              覆盖到当前人格
            </button>
          </div>
        </div>

        {result.coreIssues.length > 0 && (
          <div className="analysis-section">
            <div className="sub-title">🔍 核心问题</div>
            <ol className="num-list">
              {result.coreIssues.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        {result.suggestions.length > 0 && (
          <div className="analysis-section">
            <div className="sub-title">💡 改进建议</div>
            <ol className="num-list">
              {result.suggestions.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
          </div>
        )}

        <div className="analysis-section">
          <div className="sub-title">🔧 优化后的 Prompt</div>
          {result.changeSummary && (
            <div className="change-summary">
              <span className="change-summary-label">变更总览：</span>
              <span>{result.changeSummary}</span>
            </div>
          )}
          <pre className="optimized">{result.optimizedPrompt}</pre>
        </div>
      </div>

      {result.samplePreview && (
        <div className="card">
          <h3>👀 预期输出示例</h3>
          <div className="preview">{result.samplePreview}</div>
        </div>
      )}

      {/* 人工反馈面板 */}
      <FeedbackPanel
        dimensions={result.dimensions}
        onSubmit={onSubmitFeedback}
        existingFeedback={viewingEval?.humanFeedback}
      />
    </div>
  )
}

// ========== Feedback Panel ==========
type RatingType = '✅' | '⚠️' | '❌'
const RATING_OPTIONS: RatingType[] = ['✅', '⚠️', '❌']

function FeedbackPanel({
  dimensions,
  onSubmit,
  existingFeedback,
}: {
  dimensions: EvaluationResult['dimensions']
  onSubmit: (feedback: HumanFeedbackInput) => Promise<void>
  existingFeedback?: HumanFeedback
}) {
  const [expanded, setExpanded] = useState(false)
  const [overrides, setOverrides] = useState<Array<{ name: string; humanRating: RatingType; reason: string }>>(
    dimensions.map((d) => ({ name: d.name, humanRating: d.rating as RatingType, reason: '' }))
  )
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [feedbackError, setFeedbackError] = useState('')

  // 如果已有反馈，显示已提交状态
  if (existingFeedback && !expanded) {
    return (
      <div className="card feedback-panel">
        <div className="card-head">
          <h3>✅ 已提交人工反馈</h3>
          <button className="btn-ghost-sm" onClick={() => setExpanded(true)}>查看/重新提交</button>
        </div>
        <div className="criteria-empty">反馈已经融入到评判准则中 ({formatTime(existingFeedback.createdAt)})</div>
      </div>
    )
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    setFeedbackError('')
    setSuccess(false)
    try {
      await onSubmit({
        dimensionOverrides: overrides.map((o, i) => ({
          name: o.name,
          aiRating: dimensions[i].rating as RatingType,
          humanRating: o.humanRating,
          reason: o.reason,
        })),
        overallComment: comment,
      })
      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (e: any) {
      setFeedbackError(e.message || String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="card feedback-panel">
      <div className="card-head">
        <h3>✍️ 人工评判</h3>
        {!expanded && <button className="btn-ghost-sm" onClick={() => setExpanded(true)}>展开</button>}
        {expanded && <button className="btn-ghost-sm" onClick={() => setExpanded(false)}>收起</button>}
      </div>
      {!expanded && <div className="criteria-empty">不同意 AI 的评分？提交反馈可以让评判标准自动进化</div>}
      {expanded && (
        <div className="feedback-body">
          <div className="feedback-dimensions">
            {dimensions.map((d, i) => (
              <div className="feedback-dimension-row" key={d.name}>
                <span className="feedback-dim-name">{d.name}</span>
                <span className="feedback-ai-rating">AI: {d.rating}</span>
                <span className="feedback-arrow">→</span>
                <span className="feedback-human-rating">
                  {RATING_OPTIONS.map((r) => (
                    <button
                      key={r}
                      className={`rating-toggle ${overrides[i]?.humanRating === r ? 'active' : ''}`}
                      onClick={() =>
                        setOverrides((prev) => prev.map((o, idx) => (idx === i ? { ...o, humanRating: r } : o)))
                      }
                    >
                      {r}
                    </button>
                  ))}
                </span>
                <input
                  className="feedback-reason"
                  placeholder="理由（可选）"
                  value={overrides[i]?.reason || ''}
                  onChange={(e) =>
                    setOverrides((prev) => prev.map((o, idx) => (idx === i ? { ...o, reason: e.target.value } : o)))
                  }
                />
              </div>
            ))}
          </div>
          <textarea
            className="feedback-comment"
            placeholder="整体意见：你觉得 AI 哪里评得不对，你的标准是什么？"
            value={comment}
            onChange={(e) => setComment(e.target.value)}
          />
          <div className="feedback-actions">
            <button className="btn-primary" onClick={handleSubmit} disabled={submitting}>
              {submitting ? '⛳ 更新中...' : '提交反馈 & 更新评判标准'}
            </button>
            {success && <span className="feedback-success">✅ 评判标准已更新！</span>}
            {feedbackError && <span className="feedback-error">⚠️ {feedbackError}</span>}
          </div>
        </div>
      )}
    </div>
  )
}

// ========== Criteria Modal ==========
function CriteriaModal({
  defaultCriteria,
  customCriteria,
  onSave,
  onClose,
}: {
  defaultCriteria: string
  customCriteria: string
  onSave: (text: string) => void
  onClose: () => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(customCriteria)
  const [saved, setSaved] = useState(false)

  const startEdit = () => {
    setDraft(customCriteria)
    setEditing(true)
    setSaved(false)
  }
  const cancelEdit = () => {
    setEditing(false)
    setDraft(customCriteria)
  }
  const saveEdit = () => {
    onSave(draft.trim())
    setEditing(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }
  const clearAll = () => {
    if (!confirm('确定清空当前自定义评判准则？\n清空后下次评估只用系统默认标准。')) return
    onSave('')
    setEditing(false)
    setDraft('')
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal criteria-modal" onClick={(e) => e.stopPropagation()}>
        <h3>📐 当前评判标准</h3>
        <div className="criteria-modal-body">
          <section className="criteria-section">
            <h4>📦 默认评估标准（系统内置）</h4>
            <pre className="criteria-pre">{defaultCriteria}</pre>
          </section>
          <section className="criteria-section custom">
            <div className="criteria-head">
              <h4>🎯 自定义评判准则（人工可编辑，每次评估时附加给 AI）</h4>
              <div className="criteria-actions">
                {!editing ? (
                  <>
                    <button className="btn-ghost-sm" onClick={startEdit}>
                      ✏️ {customCriteria ? '编辑' : '手动添加'}
                    </button>
                    {customCriteria && (
                      <button className="btn-ghost-sm danger" onClick={clearAll}>
                        🗑️ 清空
                      </button>
                    )}
                    {saved && <span className="saved-tip">✅ 已保存</span>}
                  </>
                ) : (
                  <>
                    <button className="btn-primary" onClick={saveEdit}>保存</button>
                    <button className="btn-ghost-sm" onClick={cancelEdit}>取消</button>
                  </>
                )}
              </div>
            </div>
            {editing ? (
              <textarea
                className="criteria-edit-input"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={12}
                placeholder="在此填写自定义评判准则，每条一行，例如：&#10;• 模型不得自称 AI 助手或承认人格设定\n• 回复应当包含场景所需的核心信息\n• 语气与人格设定保持一致，避免做作"
              />
            ) : customCriteria ? (
              <pre className="criteria-pre custom-criteria-pre">{customCriteria}</pre>
            ) : (
              <div className="criteria-empty">
                尚未建立。可点「✏️ 手动添加」直接维护，或在「人工评判」面板提交反馈让 AI 自动生成。
              </div>
            )}
            {!editing && customCriteria && (
              <p className="criteria-tip">
                💡 提示：AI 自动生成的准则可能在多次反馈后被改写。如需锁定关键规则，建议改为人工维护。
              </p>
            )}
          </section>
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

// ========== Gen Rules Modal ==========
function GenRulesModal({
  rules,
  updating,
  onUpdate,
  onDelete,
  onClear,
  onClose,
}: {
  rules: string[]
  updating: boolean
  onUpdate: (idx: number, text: string) => void
  onDelete: (idx: number) => void
  onClear: () => void
  onClose: () => void
}) {
  const [editingIdx, setEditingIdx] = useState<number>(-1)
  const [draft, setDraft] = useState('')

  const startEdit = (idx: number) => {
    setEditingIdx(idx)
    setDraft(rules[idx])
  }
  const saveEdit = () => {
    if (editingIdx < 0) return
    onUpdate(editingIdx, draft)
    setEditingIdx(-1)
    setDraft('')
  }
  const cancelEdit = () => {
    setEditingIdx(-1)
    setDraft('')
  }

  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal criteria-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          生成人格 Prompt 额外规则 <span className="rule-count">({rules.length})</span>
          {updating && <span className="updating-tag">更新中...</span>}
        </h3>
        <div className="criteria-body">
          <div className="criteria-empty" style={{ marginBottom: 12 }}>
            仅在你点「📥 记录到生成规则」后追加。下次生成人格 Prompt 时会叠加遵守；原《人格提示词写作规范》不会被修改。
          </div>
          {rules.length === 0 ? (
            <div className="criteria-empty">尚未累积。评估后点「记录到生成规则」即可追加。</div>
          ) : (
            <ol className="rule-list">
              {rules.map((r, idx) => (
                <li key={idx} className="rule-item">
                  {editingIdx === idx ? (
                    <>
                      <textarea
                        className="rule-edit-input"
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        rows={2}
                        autoFocus
                      />
                      <div className="rule-actions">
                        <button className="btn-primary-sm" onClick={saveEdit}>保存</button>
                        <button className="btn-ghost-sm" onClick={cancelEdit}>取消</button>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="rule-text">{r}</div>
                      <div className="rule-actions">
                        <button className="btn-ghost-sm" onClick={() => startEdit(idx)}>✏️ 编辑</button>
                        <button
                          className="btn-ghost-sm danger"
                          onClick={() => {
                            if (confirm(`删除这条规则？\n\n${r}`)) onDelete(idx)
                          }}
                        >
                          🗑️ 删除
                        </button>
                      </div>
                    </>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
        <div className="modal-actions">
          <button className="btn-ghost" onClick={onClear} disabled={!rules.length}>清空全部</button>
          <button className="btn-primary" onClick={onClose}>关闭</button>
        </div>
      </div>
    </div>
  )
}

export default App
