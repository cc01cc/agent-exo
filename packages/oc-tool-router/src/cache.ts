import { readFile, writeFile, rename, mkdir, readdir } from "fs/promises"
import { join, dirname } from "path"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"

export interface SkillEntry { name: string; description: string }
export interface MCPToolEntry { name: string; description: string }
export interface MCPServerEntry {
  name: string
  type: "local" | "remote"
  status: "connected" | "skipped" | "failed"
  tools: MCPToolEntry[]
}

interface CacheData<T> { version: number; scannedAt: number; ttlMs: number; data: T }
const DEFAULT_TTL = 86_400_000

function parseFrontmatter(content: string) {
  const match = content.match(/^---\n([\s\S]*?)\n---/)
  if (!match) return {}
  const yaml = match[1]
  return {
    name: yaml.match(/^name:\s*(.+)$/m)?.[1]?.trim(),
    description: yaml.match(/^description:\s*(.+)$/m)?.[1]?.trim(),
  }
}

function resolveEnv(value: string) {
  return value.replace(/\{env:(\w+)\}/g, (_, key) => process.env[key] ?? "")
}

async function atomicWrite(path: string, data: unknown) {
  await mkdir(dirname(path), { recursive: true })
  const tmp = path + ".tmp"
  await writeFile(tmp, JSON.stringify(data, null, 2))
  await rename(tmp, path)
}

async function readCacheFile<T>(p: string): Promise<CacheData<T> | null> {
  try { return JSON.parse(await readFile(p, "utf-8")) } catch { return null }
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms))])
}

async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency: number): Promise<R[]> {
  const results: R[] = []
  const queue = items.entries()
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    for (const [i, item] of queue) { try { results[i] = await fn(item) } catch {} }
  })
  await Promise.all(workers)
  return results
}

async function* walkSKILLFiles(dir: string): AsyncGenerator<string> {
  try {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) yield* walkSKILLFiles(full)
      else if (entry.isFile() && entry.name === "SKILL.md") yield full
    }
  } catch {}
}

export class ToolIndexCache {
  private cacheDir: string
  private refreshing = false
  private bgPromise: Promise<void> | null = null
  private bgLog: (msg: string) => void = () => {}

  constructor(pluginDir: string) { this.cacheDir = join(pluginDir, "cache") }
  setLogger(log: (msg: string) => void) { this.bgLog = log }
  private bg(msg: string) { this.bgLog(msg) }

  private cachePath(name: string) { return join(this.cacheDir, name) }

  private async readValidOrStale<T>(name: string): Promise<{ data: T[]; fresh: boolean }> {
    const cached = await readCacheFile<T[]>(this.cachePath(name))
    if (cached && Date.now() - cached.scannedAt < cached.ttlMs) return { data: cached.data, fresh: true }
    if (cached) return { data: cached.data, fresh: false }
    return { data: [], fresh: false }
  }

  async getSkills() { return (await this.readValidOrStale<SkillEntry>("skill-index.json")).data }
  async getMCPServers() { return (await this.readValidOrStale<MCPServerEntry>("mcp-index.json")).data }

  async ensureFresh(projectDir: string, opencodeConfigPath: string) {
    const [skills, mcps] = await Promise.all([
      readCacheFile<SkillEntry[]>(this.cachePath("skill-index.json")),
      readCacheFile<MCPServerEntry[]>(this.cachePath("mcp-index.json")),
    ])
    if (skills && mcps && Date.now() - skills.scannedAt < skills.ttlMs && Date.now() - mcps.scannedAt < mcps.ttlMs) return
    if (this.bgPromise) return
    this.bgPromise = this.refresh(projectDir, opencodeConfigPath).finally(() => { this.bgPromise = null })
    this.bgPromise.catch(() => {})
  }

  private async refresh(projectDir: string, opencodeConfigPath: string) {
    if (this.refreshing) return
    this.refreshing = true
    try { await Promise.all([this.refreshSkills(projectDir), this.refreshMCPs(opencodeConfigPath)]) }
    finally { this.refreshing = false }
  }

  private async refreshSkills(projectDir: string) {
    const cached = await readCacheFile<SkillEntry[]>(this.cachePath("skill-index.json"))
    if (cached && Date.now() - cached.scannedAt < cached.ttlMs) return
    this.bg("🔄 scanning skills")
    const entries: SkillEntry[] = []
    for (const dir of [join(projectDir, ".opencode", "skills"), join(projectDir, ".agents", "skills")]) {
      for await (const file of walkSKILLFiles(dir)) {
        const fm = parseFrontmatter(await readFile(file, "utf-8"))
        if (fm.name) entries.push({ name: fm.name, description: fm.description ?? "" })
      }
    }
    await atomicWrite(this.cachePath("skill-index.json"), { version: 1, scannedAt: Date.now(), ttlMs: DEFAULT_TTL, data: entries })
    this.bg(`✅ skills: ${entries.length}`)
  }

  private async refreshMCPs(opencodeConfigPath: string) {
    const cached = await readCacheFile<MCPServerEntry[]>(this.cachePath("mcp-index.json"))
    if (cached && Date.now() - cached.scannedAt < cached.ttlMs) return
    this.bg("🔄 scanning MCP")
    let raw: string; let config: any
    try { raw = await readFile(opencodeConfigPath, "utf-8"); config = JSON.parse(raw) } catch { return }
    const mcpConfig = config?.mcp ?? {}
    const servers: MCPServerEntry[] = []
    const tasks: (() => Promise<MCPServerEntry>)[] = []
    for (const [name, srv] of Object.entries(mcpConfig)) {
      const c = srv as any
      if (c?.enabled === false) continue
      if (c?.type === "remote" && typeof c.url === "string") tasks.push(() => this.listRemoteTools(name, c))
      else if (c?.type === "local" && Array.isArray(c.command)) tasks.push(() => this.listLocalTools(name, c))
      else servers.push({ name, type: c?.type === "remote" ? "remote" : "local", status: "skipped", tools: [] })
    }
    servers.push(...(await pMap(tasks, fn => fn(), 4)).filter(Boolean))
    this.bg(`✅ MCP: ${servers.filter(s => s.status === "connected").length}/${servers.length} connected`)
    await atomicWrite(this.cachePath("mcp-index.json"), { version: 1, scannedAt: Date.now(), ttlMs: DEFAULT_TTL, data: servers })
  }

  private async listLocalTools(name: string, mcp: { command: string[]; environment?: Record<string, string> }) {
    let client: Client | undefined
    try {
      const env: Record<string, string> = {}
      for (const [k, v] of Object.entries(process.env)) if (typeof v === "string") env[k] = v
      if (mcp.environment) { for (const [k, v] of Object.entries(mcp.environment)) env[k] = resolveEnv(v) }
      client = new Client({ name: "oc-tool-router", version: "1.0.0" })
      await withTimeout(client.connect(new StdioClientTransport({ command: mcp.command[0], args: mcp.command.slice(1), env })), 30_000)
      const result = await withTimeout(client.listTools(), 30_000)
      return { name, type: "local" as const, status: "connected" as const, tools: result.tools.map(t => ({ name: t.name, description: t.description ?? "" })) }
    } catch { return { name, type: "local" as const, status: "failed" as const, tools: [] } }
    finally { client?.close().catch(() => {}) }
  }

  private async listRemoteTools(name: string, mcp: { url: string; headers?: Record<string, string> }) {
    let client: Client | undefined
    try {
      const requestInit: RequestInit = {}
      if (mcp.headers) { const h: Record<string, string> = {}; for (const [k, v] of Object.entries(mcp.headers)) if (typeof v === "string") h[k] = resolveEnv(v); requestInit.headers = h }
      client = new Client({ name: "oc-tool-router", version: "1.0.0" })
      await withTimeout(client.connect(new StreamableHTTPClientTransport(new URL(mcp.url), { requestInit })), 30_000)
      const result = await withTimeout(client.listTools(), 30_000)
      return { name, type: "remote" as const, status: "connected" as const, tools: result.tools.map(t => ({ name: t.name, description: t.description ?? "" })) }
    } catch { return { name, type: "remote" as const, status: "failed" as const, tools: [] } }
    finally { client?.close().catch(() => {}) }
  }
}
