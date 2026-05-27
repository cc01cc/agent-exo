import { join, dirname } from "path"
import { existsSync } from "fs"
import type { Plugin } from "@opencode-ai/plugin"
import { generateText } from "ai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import { ConfigManager, shouldDebounce } from "./config"
import { ToolIndexCache } from "./cache"
import { createFileLogger } from "./logger"

const PLUGIN_NAME = "oc-tool-router"
const REC_HEADER = "## Tool Router Recommendations"
let isProcessing = false
let msgCounter = 0

interface SubagentResult {
  action: "proceed" | "noop" | "abort"
  reason: string
  recommendedSkills: Array<{ name: string; description: string }>
  recommendedMCPs: Array<{ serverName: string; toolNames: string[] }>
}

function buildPrompt(messages: Array<{ info: any; parts: any[] }>, skills: any[], mcps: any[]) {
  const context = messages.slice(-5).map(m => {
    const text = m.parts?.map((p: any) => p.text ?? "").join(" ").slice(0, 300) ?? ""
    return `${m.info?.role ?? "?"}: ${text}`
  }).join("\n")
  const skillList = skills.map((s: any) => `- ${s.name}: ${s.description.slice(0, 80)}`).join("\n")
  const mcpList = mcps.filter((m: any) => m.status === "connected")
    .flatMap((m: any) => m.tools.map((t: any) => `- ${m.name}.${t.name}: ${t.description.slice(0, 100)}`)).join("\n")

  return [
    `你是一个工具路由分析器。`,
    ``,
    `## 可用工具`,
    skillList ? `\n### Skills\n${skillList}` : `\n### Skills\n（无）`,
    mcpList ? `\n### MCP Tools\n${mcpList}` : `\n### MCP Tools\n（无）`,
    ``,
    `## 当前对话`,
    context,
    ``,
    `## 任务`,
    `1. 如果用户打招呼/闲聊/明确说不需要 → action: "noop"`,
    `2. 如果请求在当前工具集下不可行 → action: "abort"`,
    `3. 否则 → action: "proceed"`,
    ``,
    `如果 proceed，推荐最相关的 skill（0-3 个）和 MCP tool（0-5 个，精确到 method）。`,
    `只推荐真正会用到的，不要全选。`,
    ``,
    `## 输出（纯 JSON，不要额外文字）`,
    `{"action":"proceed|noop|abort","reason":"...","recommendedSkills":[{"name":"x","description":"x"}],"recommendedMCPs":[{"serverName":"x","toolNames":["a","b"]}]}`,
  ].join("\n")
}

function parseRecommendation(subResult: string, skills: any[], mcps: any[]): SubagentResult | null {
  try {
    const jsonMatch = subResult.match(/\{[\s\S]*\}/)
    if (!jsonMatch) return null
    const json = JSON.parse(jsonMatch[0])
    if (!["proceed", "noop", "abort"].includes(json.action)) return null

    const skillNames = new Set(skills.map((s: any) => s.name))
    const mcpNames = new Set(mcps.filter((m: any) => m.status === "connected").map((m: any) => m.name))
    return {
      action: json.action, reason: json.reason ?? "",
      recommendedSkills: (json.recommendedSkills ?? []).filter((s: any) => skillNames.has(s.name)),
      recommendedMCPs: (json.recommendedMCPs ?? []).filter((m: any) => mcpNames.has(m.serverName))
        .map((m: any) => ({ serverName: m.serverName, toolNames: m.toolNames ?? [] })),
    }
  } catch { return null }
}

function makeMsg(text: string) {
  return { info: { id: `tr-${++msgCounter}`, role: "system" }, parts: [{ type: "text", text }] }
}

function injectToMessages(output: { messages: any[] }, rec: SubagentResult) {
  output.messages = output.messages.filter(
    (m: any) => m.info?.role !== "system" || !m.parts?.[0]?.text?.startsWith(REC_HEADER),
  )
  if (rec.action === "noop" || rec.action === "abort") {
    output.messages.unshift(makeMsg(`${REC_HEADER}\n\nsubagent 判断: ${rec.action}。${rec.reason}\n无需复杂处理。`))
    return
  }
  const skillsText = rec.recommendedSkills.map((s: any) => `- ${s.name}: ${s.description}`).join("\n")
  const mcpsText = rec.recommendedMCPs.flatMap((m: any) => m.toolNames.map((t: string) => `- ${m.serverName}.${t}`)).join("\n")
  const content = [REC_HEADER, "", "subagent 分析结果为 proceed。", "",
    skillsText ? `推荐使用的 skills:\n${skillsText}` : "",
    mcpsText ? `推荐使用的 MCP tools:\n${mcpsText}` : "",
    "请优先使用上述推荐的 skills 和 MCP tools。",
  ].filter(Boolean).join("\n")
  output.messages.unshift(makeMsg(content))
}

function findOpencodeConfig(dir: string) {
  for (const p of [join(dir, "opencode.json"), join(dir, "opencode.jsonc"), join(dir, ".opencode", "opencode.json")]) {
    if (existsSync(p)) return p
  }
  let current = dirname(dir)
  while (current !== dirname(current)) {
    for (const p of [join(current, "opencode.json"), join(current, ".opencode", "opencode.json")]) {
      if (existsSync(p)) return p
    }
    if (existsSync(join(current, ".git"))) break
    current = dirname(current)
  }
  return join(dir, "opencode.json")
}

export const SmartToolRouterPlugin: Plugin = async ({ directory }) => {
  const pluginDir = join(directory, ".opencode", "plugins", PLUGIN_NAME)
  const cfgMgr = new ConfigManager(pluginDir)
  const cache = new ToolIndexCache(pluginDir)

  const fileLog = createFileLogger(join(pluginDir, "logs"))
  const log = (level: "debug" | "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => {
    fileLog(level, msg, extra)
  }

  cache.setLogger((msg: string) => log("debug", msg))

  const opencodeConfigPath = findOpencodeConfig(directory)
  const cfg = await cfgMgr.loadConfig()
  let data = await cfgMgr.loadData()

  log("info", "初始化", { pluginDir, enabled: cfg.enabled, model: cfg.subagentModel, hasApiKey: !!cfg.subagentApiKey })

  if (!cfg.subagentApiKey) {
    log("warn", "subagentApiKey 未配置，请修改 config.jsonc")
  }

  return {
    "experimental.chat.messages.transform": async (_input, output) => {
      if (isProcessing) return
      if (!cfg.enabled) return

      isProcessing = true
      try {
        const now = Date.now()
        if (shouldDebounce(now, data, cfg)) {
          log("debug", "跳过：debounce", { elapsed: now - data.lastTriggeredAt })
          return
        }

        cache.ensureFresh(directory, opencodeConfigPath).catch(() => {})
        const [skills, mcps] = await Promise.all([cache.getSkills(), cache.getMCPServers()])
        log("info", "缓存就绪", { skills: skills.length, mcps: mcps.length })

        if (skills.length === 0 && mcps.length === 0) return

        const provider = createOpenAICompatible({
          name: "opencode-go",
          baseURL: cfg.subagentBaseURL,
          apiKey: cfg.subagentApiKey,
        })

        const prompt = buildPrompt(output.messages, skills, mcps)
        log("info", "调用 subagent", { model: cfg.subagentModel, promptSize: prompt.length })

        let text = ""
        try {
          const result = await generateText({
            model: provider(cfg.subagentModel),
            prompt,
            maxTokens: 1024,
            temperature: 0.3,
          })
          text = result.text ?? (typeof result.reasoning === "string" ? result.reasoning : "") ?? ""
        } catch (llmErr: any) {
          log("warn", "LLM 调用失败", { error: llmErr.message, status: llmErr.statusCode, body: llmErr.responseBody })
          throw llmErr
        }

        log("info", "subagent 响应", { responseSize: text.length, preview: text.slice(0, 800) })

        const recommendation = parseRecommendation(text, skills, mcps)
        if (recommendation) {
          if (recommendation.action === "proceed" && recommendation.recommendedSkills.length === 0 && recommendation.recommendedMCPs.length === 0) {
            log("debug", "跳过注入：无推荐项")
          } else {
            injectToMessages(output, recommendation)
            log("info", "推荐已注入", {
              action: recommendation.action, reason: recommendation.reason,
              skills: recommendation.recommendedSkills.map(s => s.name),
              mcps: recommendation.recommendedMCPs.map(m => `${m.serverName}:${m.toolNames.join(",")}`),
            })
          }
        } else {
          log("warn", "subagent 返回了无法解析的推荐", { raw: text.slice(0, 800) })
        }

        data = { ...data, lastTriggeredAt: now }
        await cfgMgr.saveData({ lastTriggeredAt: now })
      } catch (e: any) {
        log("warn", `跳过: ${e?.message ?? "未知错误"}`)
      } finally {
        isProcessing = false
      }
    },
  }
}
