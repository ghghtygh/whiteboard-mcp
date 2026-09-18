import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeGraph } from '../board/graphCodec.js'
import { graphToYjsSnapshotBase64 } from '../board/persist.js'
import { WhiteboardClient } from '../whiteboardClient.js'
import { WHITEBOARD_WEB_ORIGIN } from '../config.js'
import { jsonResult, withErrorHandling } from './util.js'

export function registerSaveTools(server: McpServer) {
  server.registerTool(
    'save_as_board',
    {
      title: 'Save as a real, persistent whiteboard-web board',
      description:
        'Optional bridge: turn a disposable graph into a real, permanently saved, collaborative ' +
        'whiteboard-web board owned by YOUR account. Requires your own whiteboard-web access token ' +
        `or personal access token (issue one at ${WHITEBOARD_WEB_ORIGIN}/settings/tokens) — this ` +
        'tool never uses any shared/service credential, so the new board is only yours. This is a ' +
        'one-way copy: the graph token keeps working independently afterwards.',
      inputSchema: {
        graph: z.string().describe('Graph token to save'),
        title: z.string().min(1).describe('Title for the new board'),
        accessToken: z.string().describe('Your own whiteboard-web access token or PAT (wbpat_...)'),
      },
    },
    withErrorHandling(async ({ graph, title, accessToken }) => {
      const snapshot = graphToYjsSnapshotBase64(decodeGraph(graph))
      const client = new WhiteboardClient(accessToken)
      const board = await client.createBoard(title)
      await client.importDocument(board.id, snapshot)
      return jsonResult({ boardId: board.id, url: `${WHITEBOARD_WEB_ORIGIN}/boards/${board.id}` })
    }),
  )
}
