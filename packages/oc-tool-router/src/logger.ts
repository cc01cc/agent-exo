import { mkdir, appendFile, readdir, unlink } from "fs/promises"
import { join } from "path"

const MAX_LINE_LEN = 2000
const MAX_LOG_DAYS = 7

export function createFileLogger(logDir: string) {
  let today = ""
  let filePath = ""

  // 启动时清理过期日志
  ;(async () => {
    try {
      const files = await readdir(logDir)
      const now = Date.now()
      for (const f of files) {
        if (!f.endsWith(".log")) continue
        const m = f.match(/^(\d{4}-\d{2}-\d{2})\.log$/)
        if (!m) continue
        const age = (now - new Date(m[1]).getTime()) / 86400000
        if (age > MAX_LOG_DAYS) await unlink(join(logDir, f))
      }
    } catch {}
  })()

  async function getFile() {
    const d = new Date()
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    if (key !== today) {
      today = key
      filePath = join(logDir, `${key}.log`)
      await mkdir(logDir, { recursive: true }).catch(() => {})
    }
    return filePath
  }

  return async (level: string, msg: string, extra?: Record<string, unknown>) => {
    let line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}${extra ? " " + JSON.stringify(extra, null, 0).slice(0, 1000) : ""}\n`
    if (line.length > MAX_LINE_LEN) line = line.slice(0, MAX_LINE_LEN) + "...[truncated]\n"
    const path = await getFile()
    await appendFile(path, line).catch(() => {})
  }
}
