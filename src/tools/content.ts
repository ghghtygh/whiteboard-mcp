import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { WhiteboardClient } from '../whiteboardClient.js'
import type { BoardDoc } from '../board/doc.js'
import { loadBoardDoc, saveBoardDoc } from '../board/codec.js'
import * as ops from '../board/ops.js'
import { jsonResult, withErrorHandling, type ToolResult } from './util.js'

const anchor = z.enum(['top', 'right', 'bottom', 'left'])
const edgeStyle = z.enum(['solid', 'dashed', 'dotted'])
const edgeDirection = z.enum(['forward', 'backward', 'both', 'none'])

export function registerContentTools(server: McpServer, client: WhiteboardClient) {
  /** boardId 로 문서를 불러와 fn 을 실행하고, fn 이 바꾼 내용을 저장한다(읽기 전용이면 save 는 no-op 비용만). */
  async function withDoc<T>(boardId: string, fn: (doc: BoardDoc) => T): Promise<T> {
    const doc = await loadBoardDoc(client, boardId)
    const result = fn(doc)
    await saveBoardDoc(client, boardId, doc)
    return result
  }

  server.registerTool(
    'get_board_content',
    {
      title: 'Get board content',
      description: 'Read all nodes, edges and groups currently on a board.',
      inputSchema: { boardId: z.string() },
    },
    withErrorHandling(async ({ boardId }): Promise<ToolResult> => {
      const doc = await loadBoardDoc(client, boardId)
      return jsonResult({
        nodes: ops.readNodes(doc),
        edges: ops.readEdges(doc),
        groups: ops.readGroups(doc),
      })
    }),
  )

  server.registerTool(
    'create_node',
    {
      title: 'Create node',
      description:
        'Create a node on a board at (x, y), the pixel position of the node’s CENTER on the board canvas. ' +
        'The `type` must be one of the catalog component types (see list_catalog). ' +
        'A node placed inside an existing group’s bounds is automatically added to that group.',
      inputSchema: {
        boardId: z.string(),
        type: z.string().describe('Catalog component type, e.g. "server"'),
        x: z.number().describe('Center X in board pixels'),
        y: z.number().describe('Center Y in board pixels'),
        catalogVersion: z.number().int().optional(),
      },
    },
    withErrorHandling(async ({ boardId, type, x, y, catalogVersion }) => {
      const id = await withDoc(boardId, (doc) => ops.createNode(doc, type, x, y, catalogVersion ?? 1))
      return jsonResult({ id })
    }),
  )

  server.registerTool(
    'move_node',
    {
      title: 'Move node',
      description:
        'Move a node to (x, y), its new TOP-LEFT corner in board pixels. Re-evaluates which group ' +
        '(if any) the node belongs to based on the new position.',
      inputSchema: { boardId: z.string(), id: z.string(), x: z.number(), y: z.number() },
    },
    withErrorHandling(async ({ boardId, id, x, y }) => {
      const ok = await withDoc(boardId, (doc) => ops.moveNode(doc, id, x, y))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'set_node_label',
    {
      title: 'Set node label',
      description: 'Set a node’s display label (max 50 characters).',
      inputSchema: { boardId: z.string(), id: z.string(), label: z.string() },
    },
    withErrorHandling(async ({ boardId, id, label }) => {
      const ok = await withDoc(boardId, (doc) => ops.setNodeLabel(doc, id, label))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'delete_node',
    {
      title: 'Delete node',
      description: 'Delete a node. Any edges connected to it are deleted too.',
      inputSchema: { boardId: z.string(), id: z.string() },
    },
    withErrorHandling(async ({ boardId, id }) => {
      const ok = await withDoc(boardId, (doc) => ops.deleteNode(doc, id))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'create_edge',
    {
      title: 'Create edge',
      description:
        'Connect two existing nodes with an edge. Returns null if `from`/`to` are the same node or ' +
        'either node id does not exist.',
      inputSchema: {
        boardId: z.string(),
        from: z.string().describe('Source node id'),
        to: z.string().describe('Target node id'),
        fromAnchor: anchor.nullable().optional(),
        toAnchor: anchor.nullable().optional(),
      },
    },
    withErrorHandling(async ({ boardId, from, to, fromAnchor, toAnchor }) => {
      const id = await withDoc(boardId, (doc) =>
        ops.createEdge(doc, from, to, fromAnchor ?? null, toAnchor ?? null),
      )
      return jsonResult({ id })
    }),
  )

  server.registerTool(
    'set_edge_style',
    {
      title: 'Set edge style',
      description: 'Set an edge’s line style.',
      inputSchema: { boardId: z.string(), id: z.string(), style: edgeStyle },
    },
    withErrorHandling(async ({ boardId, id, style }) => {
      const ok = await withDoc(boardId, (doc) => ops.setEdgeStyle(doc, id, style))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'set_edge_direction',
    {
      title: 'Set edge direction',
      description: 'Set which end(s) of an edge show an arrowhead.',
      inputSchema: { boardId: z.string(), id: z.string(), direction: edgeDirection },
    },
    withErrorHandling(async ({ boardId, id, direction }) => {
      const ok = await withDoc(boardId, (doc) => ops.setEdgeDirection(doc, id, direction))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'set_edge_label',
    {
      title: 'Set edge label',
      description: 'Set (or clear, with null) an edge’s label (max 30 characters).',
      inputSchema: { boardId: z.string(), id: z.string(), label: z.string().nullable() },
    },
    withErrorHandling(async ({ boardId, id, label }) => {
      const ok = await withDoc(boardId, (doc) => ops.setEdgeLabel(doc, id, label))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'delete_edge',
    {
      title: 'Delete edge',
      description: 'Delete an edge.',
      inputSchema: { boardId: z.string(), id: z.string() },
    },
    withErrorHandling(async ({ boardId, id }) => {
      const ok = await withDoc(boardId, (doc) => ops.deleteEdge(doc, id))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'create_group',
    {
      title: 'Create group',
      description:
        'Create a rectangular group at top-left (x, y) with the given width/height (min 60px each). ' +
        'Any existing nodes whose center falls inside the rectangle are added to the group.',
      inputSchema: {
        boardId: z.string(),
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
      },
    },
    withErrorHandling(async ({ boardId, x, y, width, height }) => {
      const id = await withDoc(boardId, (doc) => ops.createGroup(doc, x, y, width, height))
      return jsonResult({ id })
    }),
  )

  server.registerTool(
    'move_group',
    {
      title: 'Move group',
      description: 'Move a group by a relative offset (dx, dy). Its member nodes move with it.',
      inputSchema: { boardId: z.string(), id: z.string(), dx: z.number(), dy: z.number() },
    },
    withErrorHandling(async ({ boardId, id, dx, dy }) => {
      const ok = await withDoc(boardId, (doc) => ops.moveGroup(doc, id, dx, dy))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'set_group_label',
    {
      title: 'Set group label',
      description: 'Set (or clear, with null) a group’s label (max 30 characters).',
      inputSchema: { boardId: z.string(), id: z.string(), label: z.string().nullable() },
    },
    withErrorHandling(async ({ boardId, id, label }) => {
      const ok = await withDoc(boardId, (doc) => ops.setGroupLabel(doc, id, label))
      return jsonResult({ ok })
    }),
  )

  server.registerTool(
    'delete_group',
    {
      title: 'Delete group',
      description: 'Delete a group. Its member nodes are kept, just ungrouped.',
      inputSchema: { boardId: z.string(), id: z.string() },
    },
    withErrorHandling(async ({ boardId, id }) => {
      const ok = await withDoc(boardId, (doc) => ops.deleteGroup(doc, id))
      return jsonResult({ ok })
    }),
  )
}
