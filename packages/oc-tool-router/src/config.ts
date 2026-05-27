import { readFile, writeFile, mkdir } from "fs/promises"
import { dirname, join } from "path"

/** 用户配置（用户可编辑） */
export interface PluginConfig {
  enabled: boolean
  subagentModel: string
  subagentApiKey: string
  subagentBaseURL: string
  minIntervalMs: number
}

/** 运行时数据（插件自动维护） */
export interface PluginData {
  lastTriggeredAt: number
}

const CONFIG_DEFAULTS: PluginConfig = {
  enabled: true,
  subagentModel: "deepseek-v4-flash",
  subagentApiKey: "",
  subagentBaseURL: "https://api.deepseek.com/v1",
  minIntervalMs: 3000,
}

const DATA_DEFAULTS: PluginData = {
  lastTriggeredAt: 0,
}

export class ConfigManager {
  private configPath: string
  private dataPath: string

  constructor(pluginDir: string) {
    this.configPath = join(pluginDir, "config.jsonc")
    this.dataPath = join(pluginDir, "data.jsonc")
  }

  async loadConfig(): Promise<PluginConfig> {
    try {
      const raw = await readFile(this.configPath, "utf-8")
      // 只删行首的 // 注释（避免破坏 URL 中的 //）
      const cleaned = raw.replace(/^\s*\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")
      const parsed = JSON.parse(cleaned)
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === "string") parsed[k] = v.replace(/\{env:(\w+)\}/g, (_, key) => process.env[key] ?? "")
      }
      return { ...CONFIG_DEFAULTS, ...parsed }
    } catch {
      return { ...CONFIG_DEFAULTS }
    }
  }

  async loadData(): Promise<PluginData> {
    try {
      return { ...DATA_DEFAULTS, ...JSON.parse(await readFile(this.dataPath, "utf-8")) }
    } catch {
      return { ...DATA_DEFAULTS }
    }
  }

  async saveData(partial: Partial<PluginData>): Promise<void> {
    const existing = await this.loadData()
    await mkdir(dirname(this.dataPath), { recursive: true })
    await writeFile(this.dataPath, JSON.stringify({ ...existing, ...partial }, null, 2))
  }

}

export function shouldDebounce(now: number, data: PluginData, cfg: PluginConfig): boolean {
  return now - data.lastTriggeredAt < cfg.minIntervalMs
}
