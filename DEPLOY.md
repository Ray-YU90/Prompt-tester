# Prompt Tester · 部署指南

把这个工具部署到公网，让任何人都能用（每人填自己的 API Key）。

## 🚀 一键部署到 Vercel（推荐，免费）

### 准备
1. 注册一个 [GitHub](https://github.com) 账号（如果没有）
2. 注册一个 [Vercel](https://vercel.com) 账号（用 GitHub 登录）

### 步骤

**Step 1：把代码推到 GitHub**

在 `prompt-tester` 目录下：

```bash
cd prompt-tester
git init
git add .
git commit -m "init"
```

去 GitHub 网页创建一个新仓库（比如叫 `prompt-tester`），然后：

```bash
git remote add origin https://github.com/你的用户名/prompt-tester.git
git branch -M main
git push -u origin main
```

**Step 2：在 Vercel 导入项目**

1. 打开 https://vercel.com/new
2. 选择你刚才推的 `prompt-tester` 仓库 → Import
3. Framework Preset 会自动识别为 **Vite**
4. **不用填任何环境变量**（因为我们让用户在前端填 key）
5. 点 **Deploy**，等 1 分钟

**Step 3：拿到链接**

部署完成会得到一个像 `https://prompt-tester-xxx.vercel.app` 的链接，发给任何人都能打开。

### 用户首次使用流程
1. 打开你的链接
2. 右上角点「⚙️ 设置」
3. 选服务商（默认 DeepSeek）→ 填自己的 API Key → 完成
4. 创建人格任务 → 开始测试

---

## 🔒 隐私说明

- 用户填的 API Key **只存在他们自己的浏览器 localStorage**
- 服务端（Vercel Function）每次请求只是临时转发，不做任何记录或持久化
- 你（部署者）不会看到任何用户的 key

---

## 🧪 本地开发

```bash
npm install
npm run dev
```

本地开发时也可以在 `.env.local` 里填一个默认的 API Key 省得每次输入：

```
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_MODEL=deepseek-chat
LLM_API_KEY=sk-...
```

> 这个 `.env.local` 已被 `.gitignore` 忽略，不会被推到 GitHub。

---

## 📦 其他部署方式

### Cloudflare Pages
和 Vercel 类似，但 `api/evaluate.ts` 需要改成 Pages Functions 格式（放到 `functions/api/evaluate.ts`）。

### Netlify
需要把 `api/evaluate.ts` 改成 Netlify Function 格式（放到 `netlify/functions/`）。

### 自己服务器
`npm run build` → `dist/` 是静态文件；`api/evaluate.ts` 需要用 Node 跑（比如包成 Express 或用 [Hono](https://hono.dev/)）。
