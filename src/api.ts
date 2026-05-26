// LLM 调用：通过后端代理 /api/evaluate 转发（解决 CORS）
// 每个用户使用自己的 API Key，仅存在浏览器 localStorage 中

export type LLMConfig = {
  baseURL: string
  apiKey: string
  model: string
}

const EVALUATION_SYSTEM_PROMPT = `你是一个专业的 Prompt 调试专家。你的任务是评估"模型实际输出"是否符合"原始 Prompt"的设定，并给出优化建议。

## 评估维度

请从以下 5 个维度评估，每个维度给出 ✅符合 / ⚠️部分符合 / ❌不符合 中的一个评级：

1. **角色一致性**：输出的身份/视角/语气是否与 Prompt 设定一致
2. **内容完整性**：是否覆盖 Prompt 要求的所有要点，关键信息有无遗漏
3. **格式合规性**：输出格式/结构/长度是否符合 Prompt 要求
4. **指令遵循度**：Prompt 中的明确指令（禁止项、强调项）是否被遵守
5. **边界控制**：输出是否在 Prompt 设定的范围内，有无越界或调侃方向不当

## 打分规则

- 每个维度：✅ = 20 分，⚠️ = 10 分，❌ = 0 分（5 维度满分 100）
- 计算 overallScore = 5 个维度得分之和（必须严格按上述权重，不要凭感觉打分）
- 60 分及以上判为「及格」，60 分以下判为「不及格」
- 即使总分及格，但若有任意维度为 ❌，verdictReason 中需指出该硬伤

## 输出格式（严格按以下 JSON 输出，不要输出任何 JSON 以外的内容）

{
  "summary": {
    "role": "从 prompt 中提取的角色设定（一句话）",
    "goal": "核心任务（一句话）",
    "constraints": "关键约束（一句话）"
  },
  "overallScore": 70,
  "verdict": "及格",
  "verdictReason": "一句话说明为什么是这个判定（指出最大亮点或最大硬伤）",
  "dimensions": [
    { "name": "角色一致性", "rating": "✅", "comment": "具体说明，引用原文证据" },
    { "name": "内容完整性", "rating": "⚠️", "comment": "..." },
    { "name": "格式合规性", "rating": "✅", "comment": "..." },
    { "name": "指令遵循度", "rating": "❌", "comment": "..." },
    { "name": "边界控制", "rating": "✅", "comment": "..." }
  ],
  "coreIssues": [
    "按严重程度排序的核心问题1",
    "核心问题2"
  ],
  "suggestions": [
    "针对问题1的具体优化方向",
    "针对问题2的具体优化方向"
  ],
  "optimizedPrompt": "优化后的完整 prompt（在原基础上做最小改动，只针对发现的问题做修复，不要重写）",
  "changeSummary": "用 1-2 句话概括优化版相对原版做了什么核心改动（让用户一眼看懂改了啥）",
  "changeLog": [
    "【修改/新增/删除】xxx → yyy（原因：...）"
  ],
  "samplePreview": "如果按优化后的 prompt 重新生成，预期输出大概会是什么样（一句话示例）"
}

## 关键原则

- 基于证据：每个评级必须引用 prompt 原文和输出原文
- 最小改动：优先微调而非重写
- 打分严格按权重计算，不要主观放水
- 调侃方向校验：如果 prompt 涉及幽默/调侃风格，检查调侃是否往正向情绪带（期待/兴奋/有趣），而非负向（后悔/心疼/尴尬）
- 区分模型能力 vs prompt 问题`

export async function evaluatePrompt(
  config: LLMConfig,
  userPrompt: string,
  scenarioContext: string,
  modelOutput: string,
  userExtraNotes: string
): Promise<EvaluationResult> {
  const userMessage = `## 原始 Prompt
\`\`\`
${userPrompt}
\`\`\`

## 测试场景
${scenarioContext}

## 模型实际输出
\`\`\`
${modelOutput}
\`\`\`

${userExtraNotes ? `## 用户的额外要求或关注点\n${userExtraNotes}\n` : ''}
请按要求输出 JSON 评估结果。`

  const response = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        { role: 'system', content: EVALUATION_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
    }),
  })

  if (!response.ok) {
    let detail = ''
    try {
      const err = await response.json()
      detail = err.error || JSON.stringify(err)
    } catch {
      detail = await response.text()
    }
    throw new Error(`评估服务调用失败 (${response.status}): ${detail}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) {
    throw new Error('API 返回内容为空')
  }

  try {
    return JSON.parse(content) as EvaluationResult
  } catch {
    const match = content.match(/\{[\s\S]*\}/)
    if (match) return JSON.parse(match[0]) as EvaluationResult
    throw new Error('无法解析 API 返回的 JSON：' + content)
  }
}

export type EvaluationResult = {
  summary: {
    role: string
    goal: string
    constraints: string
  }
  overallScore: number
  verdict: '及格' | '不及格'
  verdictReason: string
  dimensions: Array<{
    name: string
    rating: '✅' | '⚠️' | '❌'
    comment: string
  }>
  coreIssues: string[]
  suggestions: string[]
  optimizedPrompt: string
  changeSummary: string
  changeLog: string[]
  samplePreview: string
}
