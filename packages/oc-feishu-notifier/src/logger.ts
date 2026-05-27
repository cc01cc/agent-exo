import { mkdir, appendFile } from "fs/promises"
import { join } from "path"

export function createFileLogger(logDir: string) {
  let today = ""
  let filePath = ""

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
    const line = `${new Date().toISOString()} [${level.toUpperCase()}] ${msg}${extra ? " " + JSON.stringify(extra) : ""}\n`
    const path = await getFile()
    await appendFile(path, line).catch(() => {})
  }
}
