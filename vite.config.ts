import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// 后端代理插件：将 /api/evaluate 转发到真实 LLM 服务（解决浏览器 CORS）
// 优先使用请求体里带的 baseURL/apiKey/model（每个用户自己填），后端不存储密钥
function apiProxyPlugin(env: Record<string, string>): Plugin {
  return {
    name: 'api-proxy',
    configureServer(server) {
      server.middlewares.use('/api/evaluate', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }

        // 收集请求体
        const chunks: Buffer[] = []
        for await (const chunk of req) chunks.push(chunk as Buffer)
        const bodyText = Buffer.concat(chunks).toString('utf-8')

        let body: any
        try {
          body = JSON.parse(bodyText)
        } catch {
          res.statusCode = 400
          res.end('Invalid JSON')
          return
        }

        // 优先用前端传来的配置，没有才回退到 env（仅本地开发便利用）
        const baseURL = ((body.baseURL || env.LLM_BASE_URL || 'https://api.deepseek.com/v1') as string).replace(/\/$/, '')
        const apiKey = body.apiKey || env.LLM_API_KEY
        const model = body.model || env.LLM_MODEL || 'deepseek-chat'

        if (!apiKey) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          res.end(
            JSON.stringify({
              error: '未提供 API Key，请在页面「⚙️ 设置」中填入',
            })
          )
          return
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
              temperature: 0.3,
              response_format: { type: 'json_object' },
            }),
          })

          const text = await upstream.text()
          res.statusCode = upstream.status
          res.setHeader('Content-Type', 'application/json')
          res.end(text)
        } catch (e: any) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: '上游服务调用失败：' + (e?.message || String(e)) }))
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), apiProxyPlugin(env)],
    server: {
      port: 5173,
      host: true,
    },
  }
})
