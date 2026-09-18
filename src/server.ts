import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerGraphTools } from './tools/graph.js'
import { registerCatalogTools } from './tools/catalog.js'
import { registerSaveTools } from './tools/save.js'

/**
 * 요청 하나마다 새 McpServer 를 만든다(stateless HTTP 모드) — MCP 프로토콜 특성상 요청
 * 단위로 다루는 게 가장 단순해서다. 이 서버는 어떤 그래프도 저장하지 않는다: 도구들은
 * graph 토큰(그 자체가 그래프 전체 내용)을 받아 mutate 한 뒤 새 토큰을 돌려줄 뿐이고,
 * 그 토큰을 들고 있는(또는 URL 을 아는) 사람만 해당 그래프를 볼 수 있다.
 */
export function createGraphMcpServer(): McpServer {
  const server = new McpServer({ name: 'whiteboard-mcp', version: '0.2.0' })

  registerGraphTools(server)
  registerCatalogTools(server)
  registerSaveTools(server)

  return server
}
