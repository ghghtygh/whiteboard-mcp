import { viewUrl } from '../config.js'
import { decodeGraph, emptyGraph, encodeGraph, type GraphSnapshot } from '../board/graphCodec.js'
import { WhiteboardApiError } from '../whiteboardClient.js'

export interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  isError?: boolean
}

export function jsonResult(value: unknown): ToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] }
}

/**
 * 그래프 mutation 도구의 공통 패턴: (빈 문자열이면 새 그래프로) 디코드 → fn 으로 변형 →
 * 다시 인코드해서 { ...fn 이 반환한 값, graph, url } 로 응답한다. graph 는 다음 도구 호출에
 * 그대로 넘기면 되는 opaque 토큰이고, url 은 바로 열어볼 수 있는 공유 링크다.
 */
export function mutateGraph<T extends Record<string, unknown>>(
  token: string,
  fn: (g: GraphSnapshot) => T,
): ToolResult {
  const g = token ? decodeGraph(token) : emptyGraph()
  const extra = fn(g)
  const graph = encodeGraph(g)
  return jsonResult({ ...extra, graph, url: viewUrl(graph) })
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
