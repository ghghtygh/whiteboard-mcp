import { WhiteboardApiError } from '../whiteboardClient.js'

export interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/** whiteboard-server 에러(권한 없음/404 등)를 MCP 도구 에러 결과로, 나머지는 그대로 던진다. */
export function withErrorHandling<Args extends unknown[]>(
  fn: (...args: Args) => Promise<ToolResult>,
): (...args: Args) => Promise<ToolResult> {
  return async (...args) => {
    try {
      return await fn(...args)
    } catch (err) {
      if (err instanceof WhiteboardApiError) {
        return { content: [{ type: 'text', text: `${err.code ?? 'ERROR'}: ${err.message}` }], isError: true }
      }
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: message }], isError: true }
    }
  }
}
