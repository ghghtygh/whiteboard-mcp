import { viewUrl } from '../config.js'
import { decodeGraph, encodeGraph, type GraphSnapshot } from '../board/graphCodec.js'
import { GraphError } from '../board/errors.js'
import { WhiteboardApiError } from '../whiteboardClient.js'

export interface ToolResult {
  [key: string]: unknown
  content: { type: 'text'; text: string }[]
  structuredContent?: Record<string, unknown>
  isError?: boolean
}

/** structuredContent(outputSchema 검증 대상) + 읽기 쉬운 text 사본을 함께 돌려준다. */
export function jsonResult<T extends object>(value: T): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(value, null, 2) }],
    structuredContent: value as Record<string, unknown>,
  }
}

/**
 * 그래프 mutation 도구의 공통 패턴: graph 토큰을 디코드 → fn 으로 변형(동기/비동기 모두 허용,
 * add_node 의 카탈로그 검증처럼 네트워크 호출이 필요한 경우도 있어서) → 다시 인코드해서
 * { ...fn 이 반환한 값, graph, url } 로 응답한다. 빈 토큰은 더 이상 "새 그래프"로 받아주지
 * 않는다 — create_graph 를 거치지 않고 실수로 빈 그래프에서 다시 시작하는 걸 막기 위해서다.
 */
export async function mutateGraph<T extends Record<string, unknown>>(
  token: string,
  fn: (g: GraphSnapshot) => T | Promise<T>,
): Promise<ToolResult> {
  if (!token) {
    throw new GraphError(
      'A graph token is required — call create_graph first and pass its `graph` value here.',
      'GRAPH_TOKEN_REQUIRED',
    )
  }
  const g = decodeGraph(token)
  const extra = await fn(g)
  const graph = encodeGraph(g)
  return jsonResult({ ...extra, graph, url: viewUrl(graph) })
}

/** whiteboard-server/그래프 에러를 MCP 도구 에러 결과로, 나머지는 그대로 던진다. */
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
      if (err instanceof GraphError) {
        return { content: [{ type: 'text', text: `${err.code}: ${err.message}` }], isError: true }
      }
      const message = err instanceof Error ? err.message : String(err)
      return { content: [{ type: 'text', text: message }], isError: true }
    }
  }
}
