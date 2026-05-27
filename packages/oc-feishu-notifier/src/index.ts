import { join } from 'path'
import type { Plugin } from '@opencode-ai/plugin'
import { createFileLogger } from './logger'

interface PluginConfig {
  webhookUrl: string;
  enableCardMessage: boolean;
  notifyOn: { chatComplete: boolean; sessionIdle: boolean; error: boolean; interruption: boolean };
  filter?: { minMessageLength?: number; excludeAgents?: string[]; excludeSubAgents?: boolean };
}

const PLUGIN_DIR = 'oc-feishu-notifier'

const defaultConfig: PluginConfig = {
  webhookUrl: '',
  enableCardMessage: true,
  notifyOn: { chatComplete: false, sessionIdle: true, error: true, interruption: true },
  filter: { minMessageLength: 1, excludeAgents: [], excludeSubAgents: true },
};

function sendToFeishu(webhookUrl: string, message: any, log: (...args: any[]) => void) {
  return fetch(webhookUrl, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(message),
  }).then(async res => {
    const body = await res.text()
    if (!res.ok) log('error', `发送失败`, { status: res.status, body: body.slice(0, 200) })
    else log('info', `消息发送成功`, { status: res.status })
  }).catch(e => log('error', `发送异常`, { error: String(e) }))
}

function sendCard(webhookUrl: string, title: string, content: string, template: 'blue' | 'green' | 'red' | 'orange', log: (...args: any[]) => void) {
  return sendToFeishu(webhookUrl, {
    msg_type: 'interactive',
    card: { config: { wide_screen_mode: true }, header: { title: { tag: 'plain_text', content: title }, template }, elements: [{ tag: 'div', text: { tag: 'lark_md', content } }] },
  }, log)
}

function sendText(webhookUrl: string, content: string, log: (level: "debug" | "info" | "warn" | "error", msg: string) => void) {
  return sendToFeishu(webhookUrl, { msg_type: 'text', content: { text: content } }, log)
}

function getConfig(directory: string): PluginConfig {
  try {
    const { existsSync, readFileSync } = require('fs')
    const p = join(directory, '.opencode', 'plugins', PLUGIN_DIR, 'config.jsonc')
    if (existsSync(p)) return { ...defaultConfig, ...JSON.parse(readFileSync(p, 'utf-8')) }
  } catch {}
  return defaultConfig
}

function truncate(content: string, max = 500) {
  return content.length <= max ? content : content.slice(0, max) + '... (已截断)'
}

function formatTime() {
  return new Date().toLocaleString('zh-CN')
}

const FeishuNotifier: Plugin = async ({ client, directory }) => {
  const config = getConfig(directory)
  const fileLog = createFileLogger(join(directory, '.opencode', 'plugins', PLUGIN_DIR, 'logs'))
  const log = (level: "debug" | "info" | "warn" | "error", msg: string, extra?: Record<string, unknown>) => {
    client.app.log({ body: { service: 'oc-feishu-notifier', level, message: msg, extra } }).catch(() => {})
    fileLog(level, msg, extra)
  }

  if (!config.webhookUrl) {
    log('warn', '插件未激活: 缺少飞书 Webhook 配置')
    return {}
  }

  log('info', '插件已加载', {
    excludeSubAgents: config.filter?.excludeSubAgents ?? true,
    notifyOn: config.notifyOn,
    webhookUrl: config.webhookUrl.slice(0, 40) + '...',
  })

  return {
    event: async ({ event }) => {
      const evt = event as any
      const props = evt.properties ?? {}
      const sid = (props.sessionID as string) || 'unknown'
      const excludeSub = config.filter?.excludeSubAgents
      if (excludeSub !== false && props.parentID) return

      const webhook = config.webhookUrl
      const card = config.enableCardMessage
      const time = formatTime()

      if (evt.type === 'session.idle' && config.notifyOn.sessionIdle) {
        log('info', `通知: 会话完成`, { sessionID: sid, directory: props.directory })
        const body = `**会话ID**: ${sid}\n**状态**: 空闲 / 已完成\n**时间**: ${time}\n\n会话已结束，可以查看结果了`
        if (card) await sendCard(webhook, '✅ OpenCode 会话完成', body, 'green', log)
        else await sendText(webhook, `✅ OpenCode 会话完成\n会话ID: ${sid}\n状态: 空闲 / 已完成\n时间: ${time}`, log)
        return
      }

      if (evt.type === 'permission.asked' && config.notifyOn.interruption) {
        const permission = (props.permission as string) || 'unknown'
        const patterns = ((props.patterns as string[]) || []).join(', ') || 'N/A'
        log('info', `通知: 权限确认`, { sessionID: sid, permission, patterns })
        const body = `**会话ID**: ${sid}\n**操作**: ${permission}\n**文件**: ${patterns}\n**时间**: ${time}\n\n请尽快在终端中确认`
        if (card) await sendCard(webhook, '🔐 需要权限确认', body, 'orange', log)
        else await sendText(webhook, `🔐 需要权限确认\n会话ID: ${sid}\n操作: ${permission}\n文件: ${patterns}\n时间: ${time}\n\n请尽快在终端中确认`, log)
        return
      }

      if (evt.type === 'question.asked' && config.notifyOn.interruption) {
        const questions = (props.questions as Array<{ header?: string; question?: string }>) || []
        const summary = questions[0] ? `${questions[0].header || ''}: ${questions[0].question || ''}` : '请查看终端中的问题'
        log('info', `通知: 用户输入`, { sessionID: sid, questionCount: questions.length })
        const body = `**会话ID**: ${sid}\n**问题**: ${truncate(summary, 200)}\n**时间**: ${time}\n\n请尽快在终端中回答`
        if (card) await sendCard(webhook, '❓ 需要输入', body, 'orange', log)
        else await sendText(webhook, `❓ 需要输入\n会话ID: ${sid}\n问题: ${truncate(summary, 200)}\n时间: ${time}\n\n请尽快在终端中回答`, log)
        return
      }

      if (evt.type === 'session.error' && config.notifyOn.error) {
        const errMsg = (props.error as { message?: string })?.message || '未知错误'
        log('info', `通知: 错误`, { sessionID: sid, error: errMsg })
        const body = `**会话ID**: ${sid}\n**错误信息**: ${truncate(errMsg, 200)}\n**时间**: ${time}\n\n请及时检查终端详情`
        if (card) await sendCard(webhook, '❌ OpenCode 发生错误', body, 'red', log)
        else await sendText(webhook, `❌ OpenCode 发生错误\n会话ID: ${sid}\n错误: ${truncate(errMsg, 200)}\n时间: ${time}\n\n请及时检查终端详情`, log)
      }
    },
  }
}

export default FeishuNotifier
