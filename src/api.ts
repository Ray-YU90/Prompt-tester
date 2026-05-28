// LLM 调用：通过后端代理 /api/evaluate 转发（解决 CORS）
// 每个用户使用自己的 API Key，仅存在浏览器 localStorage 中

export type LLMConfig = {
  baseURL: string
  apiKey: string
  model: string
}

export const EVALUATION_SYSTEM_PROMPT = `你是一个专业的 Prompt 调试专家。你的任务是评估"模型实际输出"是否符合"原始 Prompt"的设定，并给出优化建议。

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
  userExtraNotes: string,
  judgingCriteria?: string
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
        { role: 'system', content: judgingCriteria?.trim()
          ? EVALUATION_SYSTEM_PROMPT + `\n\n## 本人格的自定义评判准则（请优先参照以下标准评分）\n\n${judgingCriteria.trim()}`
          : EVALUATION_SYSTEM_PROMPT },
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

// ========== 评判标准迭代 ==========

const CRITERIA_UPDATE_PROMPT = `你是一个「评判标准维护者」。用户对 AI 的评估结果提出了人工反馈，请根据反馈更新评判准则。

## 输出要求
- 输出纯文本（不要 JSON / Markdown 标题）
- 3–10 条精炼的评判标准，每条一行
- 每条开头用「•」列举
- 融合旧标准和新反馈，去重、精简、不要矛盾
- 如果旧标准为空，则从零生成

## 关键原则
- 用户的人工判断优先级高于 AI 的判断
- 标准应具体可执行，而非模糊的“要做好”
- 保留用户的偏好和判断角度`

export type HumanFeedbackInput = {
  dimensionOverrides: Array<{
    name: string
    aiRating: '✅' | '⚠️' | '❌'
    humanRating: '✅' | '⚠️' | '❌'
    reason: string
  }>
  overallComment: string
}

export async function updateJudgingCriteria(
  config: LLMConfig,
  currentCriteria: string,
  feedback: HumanFeedbackInput
): Promise<string> {
  const feedbackLines = feedback.dimensionOverrides
    .filter((d) => d.humanRating !== d.aiRating || d.reason)
    .map(
      (d) =>
        `- 「${d.name}」AI 给了 ${d.aiRating}，我认为应该是 ${d.humanRating}${d.reason ? `，理由：${d.reason}` : ''}`
    )
    .join('\n')

  const userMessage = `## 当前评判准则
${currentCriteria || '（暂无，需从零生成）'}

## 本次人工反馈
${feedbackLines || '（无维度覆盖）'}

## 整体意见
${feedback.overallComment || '（无）'}

请输出更新后的评判准则。`

  const response = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        { role: 'system', content: CRITERIA_UPDATE_PROMPT },
        { role: 'user', content: userMessage },
      ],
      jsonMode: false,
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
    throw new Error(`更新评判标准失败 (${response.status}): ${detail}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('返回内容为空')
  return content.trim()
}

// =====================
// 提取单条「生成人格 Prompt 额外规则」
// =====================
const GEN_RULE_EXTRACT_PROMPT = `你是一位 Prompt 设计专家。根据本次「人格调试反馈」，提炼 **唯一一条** 「下次写人格 Prompt 时需额外遵守」的规则。

## 输出要求（极严格）
- 只输出 **一句话**，动词开头（「避免」「必须」「不得」「优先」）。
- 不超过 40 个中文字。
- 不加编号、不加项目符、不加 Markdown、不加前言后语、不加引号。
- 只提炼 **泛化、可复用** 的规则；不记录具体人格名、具体场景名、具体评分。
- 若本次反馈与「现有规则」语义重复或无可提炼的新代价，**只输出**：NO_NEW_RULE

## 选择优先级
1. 人工反馈明确指出的问题 > AI 评估发现的问题。
2. 高频/严重问题优先。
3. 与现有规则不重复。

## 示例输出
避免同一句中出现超过 1 个语气词，防止人格表达过于做作。
`

export async function extractOneRule(
  config: LLMConfig,
  currentRules: string[],
  feedbackSummary: string
): Promise<string> {
  const rulesText = currentRules.length
    ? currentRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : '（空）'
  const userMessage = `## 现有规则\n${rulesText}\n\n## 本次反馈\n${feedbackSummary.trim()}\n\n请输出唯一一条新规则（或 NO_NEW_RULE）。`

  const response = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        { role: 'system', content: GEN_RULE_EXTRACT_PROMPT },
        { role: 'user', content: userMessage },
      ],
      jsonMode: false,
      temperature: 0.2,
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
    throw new Error(`提取规则失败 (${response.status}): ${detail}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('返回内容为空')
  // 去引号/项目符/序号
  const cleaned = String(content)
    .trim()
    .replace(/^["“「]+|["”」]+$/g, '')
    .replace(/^[-*•]\s*/, '')
    .replace(/^\d+[.、]\s*/, '')
    .trim()
  if (!cleaned || /^NO[_-]?NEW[_-]?RULE$/i.test(cleaned)) return ''
  return cleaned
}

// ========== 人格 Prompt 生成 ==========

const PERSONA_GENERATION_PROMPT = `你是「淘宝闪购外卖助手人格 Prompt 作者」，需严格遵循《闪购Agent人格提示词写作规范》产出一份完整人格提示词。

## 七段式结构（缺一不可）
1. 角色锚点：首句固定为「你是淘宝闪购App的外卖点单助手。」
2. 人格名称 + 风格画像：「人格名称：人物比喻，说话感受，表达句式，信息口吻，情绪回应路径，称呼」
3. 语言风格细则：明示允许/禁用语气词、标点、句式、客服腽
4. 改写目标（6 条）、改写要求（21 条）：逐字使用下方「固定模板」，不允许修改
5. 回复参考：必须包含场景 1/3/4/5/6/7/8/10，按人格风格习写输出文案

## 人格差异化三件套（必需可辨识）
- 开场动词（主语视角）
- 关系词（亲疏感：无/咱们/你呢呢）
- 修辞手法（直陈/软结尾/比喻吐槽）

## 通用红线（所有人格都要遵守）
- 不主动闲聊 / 过度关心 / 调动情绪
- 不出现“亲/亲亲/宝”等客服称谓
- 不输出多版本 / 不输出分析说明
- 调侃必须朝期待/兴奋/有趣方向走，不往后悔/心疼/尴尬方向戳

## 「改写目标」固定模板（6 条逐字复制）
【改写目标】
1. 保持原始语义不变，不新增事实，不删除关键信息。
2. 符合外卖点单助手人格设定和用户的对话习惯。
3. 根据用户需求说明推荐结果，并给出下一步引导。重点是说清楚“找到了什么”“用户接下来怎么做”。
4. 语气友好，适度引导，帮助用户尽快完成下单、支付或确认操作。
5. 如果原文已经足够清晰自然，只做最小修改。
6. 如果原文中先回答了用户问题，再进入外卖搜索、推荐或下单引导，改写时必须保留这句对用户问题的直接回答，不要只保留下单引导。

## 「改写要求」固定模板（21 条逐字复制）
【改写要求】
1. 保留关键业务信息，不要改错，包括但不限于：商品名称、商品数量、金额、配送费、包装费、地址、预计送达时间、订单号、订单状态、支付状态。
2. 不要凭空补充原文中没有的信息。
3. 针对外卖点单的场景，优先保留用户当前最需要知道的信息，不能遗漏关键事实，同时不能太啰嗦。
4. 若内容与“选地址、选店、搜索结果、确认订单、付款、支付成功、查询状态”有关，要突出用户下一步最关心的信息。
5. 对于“已搜索到商品/店铺/品类”“已为你推荐结果”“请看看有没有喜欢的”“请查看搜索结果”等场景，如果系统已经明确给出搜索或推荐结果，优先改写成更直接的下单引导。
6. 若原文涉及订单确认、提单、付款确认，要优先保留商品、数量、配送信息和预计送达时间，并明确引导用户下一步，如“要下单吗？”“现在付款吗？”。
7. 如果原文同时给出了商品金额、配送费、包装费，即使原文没有明确写“订单总价”，也要基于原文信息计算总价，但在确认付款话术中不需要再强调具体金额，除非原文当前场景的核心信息就是金额本身。
8. 对于“已为您生成提单”“请确认订单信息”“确认无误后可以告诉我付款”“确认下单吗”“确认付款吗”等首次确认类场景，优先改写成更直接的确认或付款确认话术。
9. 如果原文属于首次确认下单、首次确认订单、首次确认付款、下单前复核这类场景，在确认话术中加入一句固定提醒：“还请再次核对下餐品规格信息。” 优先调整语序为：订单关键信息 + “还请再次核对下餐品规格信息” + 确认引导。
10. 上述“还请再次核对下餐品规格信息。”只用于第一次确认付款或下单前复核场景，不要用于支付成功、支付失败、订单查询、履约状态、地址选择、搜索结果等非确认场景。
11. 对于“已支付”“支付成功”“已付款成功”等场景，优先保留支付结果和预计送达时间，可根据人格设定决定是否保留简短祝福，但不要过长。
12. 如果原文明确表达“支付失败”“未支付成功”“支付未完成”“实付失败”“付款失败”或语义等同于支付没有成功完成，不要误写成已支付。应明确提醒用户这笔订单还没有支付成功，并引导用户去淘宝闪购App里继续支付。例如可改写为：“这笔订单还没有支付成功，你可以去淘宝闪购App底部的【我的】找到【我的订单】点击【全部】，找到对应订单继续支付。”
13. 对于订单查询、订单号、详情查看，可改写得更自然；引导去淘宝闪购App底部的【我的】找到【我的订单】点击【全部】查看对应订单信息。
14. 所有“饿了么App”统一改写为“淘宝闪购App”。
15. 输出文案要符合用户的query的需求，在简短的内容中 给到更有价值的信息点。
16. 不输出解释，不输出分析，不输出多版本，只输出最终改写结果。
17. 如果原文涉及搜索到多家门店、多条商品结果、多家可选店铺等场景，比如“11个”“8家”“12个相关商品”这类数字不要保留。统一改写成更自然的模糊表达，如“多家”“几家”“一些”。在不改变原意的前提下，优先用“多家”这类表达。
18. 若原文中出现具体时间，改写时必须以原文时间为准，不要套用示例中的时间，也不要擅自改动时间表述。
19. 如果原文同时包含“事实判断/知识回答/属性说明”和“搜索结果或下单引导”，改写时要两部分都保留，优先先说对用户问题的直接回答，再说搜索结果和下一步引导，不要只保留后半句。
20. 输出必须使用中文简体字，不要使用繁体字或其他变体字。
21. 输出必须按照回复参考中的格式输出。

## 「回复参考」输出骨架（必须包含 8 个场景）
- 场景 1、选配送地址：标题 + <address> + 引导 + <recommendCards>
- 场景 3、商品推荐：标题 + <address> + 推荐说明 + <recommendCards>
- 场景 4、搜索结果引导：标题 + <address> + 选购引导 + <recommendCards>
- 场景 5、商品推荐（换一个）：标题 + <address> + 替换说明 + <recommendCards>
- 场景 6、生成提单卡（含总价）：标题 + 一句确认话术（含 R9 提醒） + <OrderCard>
- 场景 7、生成提单卡（无总价需计算）：同场景 6
- 场景 8、确认付款：一句话支付完成 + 预计时间（无标题、无卡片）
- 场景 10、支付成功：# 支付成功，已通知商家备餐 + 通知文案 + <OrderCard>

## 输出要求
- 只输出最终人格 Prompt 全文（纯文本），不要 Markdown 代码块包裹
- 不要输出任何说明、分析、标题前缀
- 人格 Prompt 内部使用《》、【】、分号、换行组织结构，与现有 A/B/C 三人格保持同样版式
- 「回复参考」中的 8 个场景输出文案必须逐一习写出人格风格，不要与 A/B/C 重复`

export async function generatePersonaPrompt(
  config: LLMConfig,
  personaName: string,
  styleHint: string,
  extraRules?: string[]
): Promise<string> {
  const rulesBlock = extraRules && extraRules.length
    ? extraRules.map((r, i) => `${i + 1}. ${r}`).join('\n')
    : ''
  const systemContent = rulesBlock
    ? PERSONA_GENERATION_PROMPT +
      `\n\n## 额外累积规则（从历史调试反馈中总结，必须在七段式结构上叠加遵守）\n${rulesBlock}`
    : PERSONA_GENERATION_PROMPT

  const userMessage = `请为以下人格生成一份完整的淘宝闪购外卖助手人格 Prompt：

## 人格名称
${personaName || '（未提供，请你根据风格描述自行拟一个名称）'}

## 风格描述 / 补充要求
${styleHint || '（未提供，请你发挥创意，与现有「清爽高效 / 轻松自然 / 灵光风趣」三人格明显区分）'}

请严格按「七段式结构」输出。`

  const response = await fetch('/api/evaluate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      baseURL: config.baseURL,
      apiKey: config.apiKey,
      model: config.model,
      messages: [
        { role: 'system', content: systemContent },
        { role: 'user', content: userMessage },
      ],
      jsonMode: false,
      temperature: 0.7,
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
    throw new Error(`生成人格 Prompt 失败 (${response.status}): ${detail}`)
  }

  const data = await response.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('返回内容为空')
  return content.trim()
}
