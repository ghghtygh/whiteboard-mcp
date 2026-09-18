import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { WhiteboardClient } from '../whiteboardClient.js'
import { jsonResult, withErrorHandling } from './util.js'

export function registerBoardTools(server: McpServer, client: WhiteboardClient) {
  // 의도적으로 "list_boards" 도구는 없다. 이 서버는 인증 없이 열려 있고 모든 MCP 호출이
  // 같은 서비스 계정을 공유하므로, 목록 조회를 허용하면 누구든 다른 사람이 만든 보드를
  // 열거해 버릴 수 있다. 대신 board id 를 "이걸 아는 사람만 접근 가능한" 캡ability 로
  // 취급한다 — create_board 가 반환한 id 를 그 호출자만 알고, 그 id 를 넘겨야만 이후
  // 도구를 쓸 수 있다. 이 보드들은 또한 일정 시간 뒤 자동 삭제된다(cleanup.ts, 1회용).

  server.registerTool(
    'get_board',
    {
      title: 'Get board',
      description: 'Get a board’s metadata (title, owner, timestamps) by id.',
      inputSchema: { boardId: z.string().describe('Board id') },
    },
    withErrorHandling(async ({ boardId }) => jsonResult(await client.getBoard(boardId))),
  )

  server.registerTool(
    'create_board',
    {
      title: 'Create board',
      description:
        'Create a new, empty, single-use whiteboard and return its metadata (including its id). ' +
        'The id is a capability: keep it for the rest of this session — no tool lets you (or ' +
        'anyone else) discover a board id you don’t already have. The board is auto-deleted after ' +
        'a period of inactivity.',
      inputSchema: { title: z.string().min(1).describe('Board title') },
    },
    withErrorHandling(async ({ title }) => jsonResult(await client.createBoard(title))),
  )

  server.registerTool(
    'rename_board',
    {
      title: 'Rename board',
      description: 'Rename a board.',
      inputSchema: { boardId: z.string(), title: z.string().min(1) },
    },
    withErrorHandling(async ({ boardId, title }) => jsonResult(await client.renameBoard(boardId, title))),
  )

  server.registerTool(
    'delete_board',
    {
      title: 'Delete board',
      description: 'Permanently delete a board and all of its content. This cannot be undone.',
      inputSchema: { boardId: z.string() },
    },
    withErrorHandling(async ({ boardId }) => {
      await client.deleteBoard(boardId)
      return jsonResult({ ok: true })
    }),
  )

  server.registerTool(
    'list_catalog',
    {
      title: 'List catalog components',
      description:
        'List the component types available for nodes (e.g. "server", "database"). ' +
        'Use the `type` field returned here as the `type` argument to create_node.',
      inputSchema: { type: z.string().optional().describe('Filter by a specific component type') },
    },
    withErrorHandling(async ({ type }) => jsonResult(await client.listCatalog(type))),
  )
}
