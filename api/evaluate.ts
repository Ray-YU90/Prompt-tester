// Vercel Serverless Function：将前端请求转发到 LLM 服务
// 部署到 Vercel 后，前端 fetch('/api/evaluate') 会自动走到这里
// 用户在前端填的 apiKey 通过 body 传过来，本函数仅做一次性转发，不做任何持久化

export const config = {
  runtime: 'edge',
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 })
  }

  let body: any
  try {
    body = await req.json()
  } catch {
    return new Response('Invalid JSON', { status: 400 })
  }

  const baseURL = (body.baseURL || 'https://api.deepseek.com/v1').replace(/\/$/, '')
  const apiKey = body.apiKey
  const model = body.model || 'deepseek-chat'

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: '未提供 API Key，请在页面「⚙️ 设置」中填入' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    )
  }

  try {
    const upstream = await fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: body.messages,
        temperature: body.temperature ?? 0.3,
        ...(body.jsonMode === false ? {} : { response_format: { type: 'json_object' } }),
      }),
    })

    const text = await upstream.text()
    return new Response(text, {
      status: upstream.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e: any) {
    return new Response(
      JSON.stringify({ error: '上游服务调用失败：' + (e?.message || String(e)) }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    )
  }
}
