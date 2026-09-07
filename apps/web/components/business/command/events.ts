// 命令面板 / AI 抽屉的外部打开事件（侧栏搜索钮、面板里的「问 AI」都走这里）
export const OPEN_COMMAND_EVENT = "ka:open-command"
export const OPEN_AGENT_EVENT = "ka:open-agent"

export function openCommandPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_COMMAND_EVENT))
}

export function openAgentDrawer(query?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_AGENT_EVENT, { detail: { query: query ?? "" } }))
}
