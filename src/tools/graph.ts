import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeGraph, emptyGraph, encodeGraph } from '../board/graphCodec.js'
import * as ops from '../board/ops.js'
import { viewUrl } from '../config.js'
import { jsonResult, mutateGraph, withErrorHandling } from './util.js'

const anchor = z.enum(['top', 'right', 'bottom', 'left'])
const edgeStyle = z.enum(['solid', 'dashed', 'dotted'])
const edgeDirection = z.enum(['forward', 'backward', 'both', 'none'])
// 모든 mutation 도구가 받는 현재 그래프 상태 — create_graph 나 이전 도구 호출이 돌려준
// opaque 토큰을 그대로 넘긴다. 매 응답에 다음 호출용 graph 와 바로 열어볼 수 있는 url 이 온다.
const graphArg = z.string().describe('Current graph token from a previous call (empty string for a new graph)')

export function registerGraphTools(server: McpServer) {
  server.registerTool(
    'create_graph',
    {
      title: 'Create graph',
      description:
        'Start a new, empty graph and get back its token + a shareable view URL. This graph lives ' +
        'entirely in the token/URL — nothing is stored on any server, so only whoever has this URL ' +
        '(or the token) can ever see it. Pass the returned `graph` token to every other tool.',
      inputSchema: {},
    },
    withErrorHandling(async () => {
      const graph = encodeGraph(emptyGraph())
      return jsonResult({ graph, url: viewUrl(graph) })
    }),
  )

  server.registerTool(
    'get_graph',
    {
      title: 'Get graph',
      description: 'Decode a graph token back into its nodes, edges and groups.',
      inputSchema: { graph: graphArg },
    },
    withErrorHandling(async ({ graph }) => jsonResult(decodeGraph(graph))),
  )

  server.registerTool(
    'add_node',
    {
      title: 'Add node',
      description:
        'Add a node at (x, y), the pixel position of the node’s CENTER on the canvas. `type` should ' +
        'be one of the catalog component types (see list_catalog), but any string works. A node ' +
        'placed inside an existing group’s bounds is automatically added to that group.',
      inputSchema: {
        graph: graphArg,
        type: z.string().describe('Component type, e.g. "server"'),
        x: z.number().describe('Center X in canvas pixels'),
        y: z.number().describe('Center Y in canvas pixels'),
        catalogVersion: z.number().int().optional(),
      },
    },
    withErrorHandling(async ({ graph, type, x, y, catalogVersion }) =>
      mutateGraph(graph, (g) => ({ id: ops.addNode(g, type, x, y, catalogVersion ?? 1) })),
    ),
  )

  server.registerTool(
    'move_node',
    {
      title: 'Move node',
      description:
        'Move a node to (x, y), its new TOP-LEFT corner. Re-evaluates which group (if any) it ' +
        'belongs to based on the new position.',
      inputSchema: { graph: graphArg, id: z.string(), x: z.number(), y: z.number() },
    },
    withErrorHandling(async ({ graph, id, x, y }) => mutateGraph(graph, (g) => ({ ok: ops.moveNode(g, id, x, y) }))),
  )

  server.registerTool(
    'set_node_label',
    {
      title: 'Set node label',
      description: 'Set a node’s display label (max 50 characters).',
      inputSchema: { graph: graphArg, id: z.string(), label: z.string() },
    },
    withErrorHandling(async ({ graph, id, label }) =>
      mutateGraph(graph, (g) => ({ ok: ops.setNodeLabel(g, id, label) })),
    ),
  )

  server.registerTool(
    'remove_node',
    {
      title: 'Remove node',
      description: 'Remove a node. Any edges connected to it are removed too.',
      inputSchema: { graph: graphArg, id: z.string() },
    },
    withErrorHandling(async ({ graph, id }) => mutateGraph(graph, (g) => ({ ok: ops.removeNode(g, id) }))),
  )

  server.registerTool(
    'add_edge',
    {
      title: 'Add edge',
      description:
        'Connect two existing nodes. Returns id: null if `from`/`to` are the same node or either ' +
        'node id does not exist in this graph.',
      inputSchema: {
        graph: graphArg,
        from: z.string().describe('Source node id'),
        to: z.string().describe('Target node id'),
        fromAnchor: anchor.nullable().optional(),
        toAnchor: anchor.nullable().optional(),
      },
    },
    withErrorHandling(async ({ graph, from, to, fromAnchor, toAnchor }) =>
      mutateGraph(graph, (g) => ({ id: ops.addEdge(g, from, to, fromAnchor ?? null, toAnchor ?? null) })),
    ),
  )

  server.registerTool(
    'set_edge_style',
    {
      title: 'Set edge style',
      description: 'Set an edge’s line style.',
      inputSchema: { graph: graphArg, id: z.string(), style: edgeStyle },
    },
    withErrorHandling(async ({ graph, id, style }) =>
      mutateGraph(graph, (g) => ({ ok: ops.setEdgeStyle(g, id, style) })),
    ),
  )

  server.registerTool(
    'set_edge_direction',
    {
      title: 'Set edge direction',
      description: 'Set which end(s) of an edge show an arrowhead.',
      inputSchema: { graph: graphArg, id: z.string(), direction: edgeDirection },
    },
    withErrorHandling(async ({ graph, id, direction }) =>
      mutateGraph(graph, (g) => ({ ok: ops.setEdgeDirection(g, id, direction) })),
    ),
  )

  server.registerTool(
    'set_edge_label',
    {
      title: 'Set edge label',
      description: 'Set (or clear, with null) an edge’s label (max 30 characters).',
      inputSchema: { graph: graphArg, id: z.string(), label: z.string().nullable() },
    },
    withErrorHandling(async ({ graph, id, label }) =>
      mutateGraph(graph, (g) => ({ ok: ops.setEdgeLabel(g, id, label) })),
    ),
  )

  server.registerTool(
    'remove_edge',
    {
      title: 'Remove edge',
      description: 'Remove an edge.',
      inputSchema: { graph: graphArg, id: z.string() },
    },
    withErrorHandling(async ({ graph, id }) => mutateGraph(graph, (g) => ({ ok: ops.removeEdge(g, id) }))),
  )

  server.registerTool(
    'add_group',
    {
      title: 'Add group',
      description:
        'Add a rectangular group at top-left (x, y) with the given width/height (min 60px each). ' +
        'Any existing nodes whose center falls inside the rectangle are added to the group.',
      inputSchema: {
        graph: graphArg,
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
      },
    },
    withErrorHandling(async ({ graph, x, y, width, height }) =>
      mutateGraph(graph, (g) => ({ id: ops.addGroup(g, x, y, width, height) })),
    ),
  )

  server.registerTool(
    'move_group',
    {
      title: 'Move group',
      description: 'Move a group by a relative offset (dx, dy). Its member nodes move with it.',
      inputSchema: { graph: graphArg, id: z.string(), dx: z.number(), dy: z.number() },
    },
    withErrorHandling(async ({ graph, id, dx, dy }) =>
      mutateGraph(graph, (g) => ({ ok: ops.moveGroup(g, id, dx, dy) })),
    ),
  )

  server.registerTool(
    'set_group_label',
    {
      title: 'Set group label',
      description: 'Set (or clear, with null) a group’s label (max 30 characters).',
      inputSchema: { graph: graphArg, id: z.string(), label: z.string().nullable() },
    },
    withErrorHandling(async ({ graph, id, label }) =>
      mutateGraph(graph, (g) => ({ ok: ops.setGroupLabel(g, id, label) })),
    ),
  )

  server.registerTool(
    'remove_group',
    {
      title: 'Remove group',
      description: 'Remove a group. Its member nodes are kept, just ungrouped.',
      inputSchema: { graph: graphArg, id: z.string() },
    },
    withErrorHandling(async ({ graph, id }) => mutateGraph(graph, (g) => ({ ok: ops.removeGroup(g, id) }))),
  )
}
