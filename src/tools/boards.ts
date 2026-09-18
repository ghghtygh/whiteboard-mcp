import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { WhiteboardClient } from '../whiteboardClient.js'
import { jsonResult, withErrorHandling } from './util.js'

export function registerBoardTools(server: McpServer, client: WhiteboardClient) {
  server.registerTool(
    'list_boards',
    {
      title: 'List boards',
      description: 'List the whiteboards owned by or shared with the current user.',
      inputSchema: {},
    },
    withErrorHandling(async () => jsonResult(await client.listBoards())),
  )

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
      description: 'Create a new, empty whiteboard and return its metadata.',
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
