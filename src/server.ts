import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WhiteboardClient } from './whiteboardClient.js'
import { registerBoardTools } from './tools/boards.js'
import { registerContentTools } from './tools/content.js'

/**
 * 요청 하나마다 새 McpServer 를 만든다(stateless HTTP 모드) — MCP 프로토콜 특성상 요청 단위로
 * 다루는 게 가장 단순해서다. token 은 항상 이 서버의 고정 서비스 계정 PAT (config.ts) 이며,
 * MCP 클라이언트 자체는 인증하지 않는다. whiteboard-server 쪽 권한 검사(그 계정이 멤버인
 * 보드인지)는 여전히 매 REST 호출마다 이뤄진다.
 */
export function createBoardMcpServer(token: string): McpServer {
  const server = new McpServer({ name: 'whiteboard-mcp', version: '0.1.0' })
  const client = new WhiteboardClient(token)

  registerBoardTools(server, client)
  registerContentTools(server, client)

  return server
}
