import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { registerGraphTools } from './tools/graph.js'
import { registerCatalogTools } from './tools/catalog.js'
import { registerSaveTools } from './tools/save.js'
import { registerApplyOperationsTool } from './tools/applyOperations.js'
import { registerRenderTool } from './tools/render.js'

const INSTRUCTIONS = `
This server edits a "graph" (nodes, edges and groups for a whiteboard diagram) that is never
stored server-side — it exists only as an opaque "graph" token you receive from every tool call
and must pass into the next one.

- Call create_graph first. Every mutation tool after that requires its \`graph\` argument.
- Always use the MOST RECENT graph token. Every mutation tool returns a new one; the previous
  token is now stale, and building on it again would silently drop later changes.
- Call list_catalog before choosing a node's \`type\` — add_node and apply_operations reject
  unknown types with a clear error.
- add_node and move_node both take the node's CENTER position (x, y), not its top-left corner.
  add_group and move_group are different: add_group's (x, y) is the top-left corner, and
  move_group's (dx, dy) is a relative offset, not an absolute position.
- Nodes must already exist in the graph before you can connect them with add_edge.
- An invalid reference (unknown node/edge/group id, unknown component type, connecting a node to
  itself) always raises a clear tool error — it never fails silently.
- For several changes at once (e.g. "draw this architecture"), prefer one apply_operations call
  over many separate ones. Give add_node/add_edge/add_group entries a \`ref\` name and reference
  it from later entries in the same batch as "$ref:<name>" — you don't need to know real ids
  until the batch finishes.
- Every response includes a \`url\` you can hand to the user to view the current graph.
- save_as_board is optional: it copies the graph into a real, permanently saved whiteboard-web
  board under the caller's own account (needs their own access token/PAT) — use it only when the
  user wants to keep collaborating on this beyond the current conversation.
- render_graph shows an interactive widget where supported (e.g. ChatGPT). Call it once when a
  diagram is ready to show, not after every individual edit — keep editing with the other tools
  first, then render.
`.trim()

/**
 * 요청 하나마다 새 McpServer 를 만든다(stateless HTTP 모드) — MCP 프로토콜 특성상 요청
 * 단위로 다루는 게 가장 단순해서다. 이 서버는 어떤 그래프도 저장하지 않는다: 도구들은
 * graph 토큰(그 자체가 그래프 전체 내용)을 받아 mutate 한 뒤 새 토큰을 돌려줄 뿐이고,
 * 그 토큰을 들고 있는(또는 URL 을 아는) 사람만 해당 그래프를 볼 수 있다.
 */
export function createGraphMcpServer(): McpServer {
  const server = new McpServer({ name: 'whiteboard-mcp', version: '0.3.0' }, { instructions: INSTRUCTIONS })

  registerGraphTools(server)
  registerCatalogTools(server)
  registerApplyOperationsTool(server)
  registerSaveTools(server)
  registerRenderTool(server)

  return server
}
