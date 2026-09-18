import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WhiteboardClient } from './whiteboardClient.js'
import { registerBoardTools } from './tools/boards.js'
import { registerContentTools } from './tools/content.js'

/**
 * 요청 하나마다 새 McpServer 를 만든다(stateless HTTP 모드). 그 요청의 Authorization 토큰을
 * 클로저로 도구 핸들러에 묶어서, 세션 맵 없이도 "이 도구 호출은 이 사용자 권한으로" 를
 * 자연스럽게 보장한다 — 모든 REST 호출은 결국 whiteboard-server 가 그 토큰으로 권한을 검사한다.
 */
export function createBoardMcpServer(token: string): McpServer {
  const server = new McpServer({ name: 'whiteboard-mcp', version: '0.1.0' })
  const client = new WhiteboardClient(token)

  registerBoardTools(server, client)
  registerContentTools(server, client)

  return server
}
