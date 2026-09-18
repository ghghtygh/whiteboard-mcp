import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertValidType } from '../board/catalogCache.js'
import { decodeGraph, emptyGraph, encodeGraph } from '../board/graphCodec.js'
import * as ops from '../board/ops.js'
import { viewUrl } from '../config.js'
import { anchorSchema, edgeDirectionSchema, edgeSchema, edgeStyleSchema, graphArg, graphRefOutput, groupSchema, nodeSchema } from './schemas.js'
import { jsonResult, mutateGraph, withErrorHandling } from './util.js'

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
      outputSchema: graphRefOutput,
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
      outputSchema: { nodes: z.array(nodeSchema), edges: z.array(edgeSchema), groups: z.array(groupSchema) },
    },
    withErrorHandling(async ({ graph }) => jsonResult(decodeGraph(graph))),
  )

  server.registerTool(
    'add_node',
    {
      title: 'Add node',
      description:
        'Add a node at (x, y), the pixel position of the node’s CENTER on the canvas (move_node uses ' +
        'the same convention). `type` must be one of the catalog component types — call list_catalog ' +
        'first, an unknown type is rejected. A node placed inside an existing group’s bounds is ' +
        'automatically added to that group.',
      inputSchema: {
        graph: graphArg,
        type: z.string().describe('Catalog component type, e.g. "server" — see list_catalog'),
        x: z.number().describe('Center X in canvas pixels'),
        y: z.number().describe('Center Y in canvas pixels'),
        catalogVersion: z.number().int().optional(),
      },
      outputSchema: { id: z.string(), ...graphRefOutput },
    },
    withErrorHandling(async ({ graph, type, x, y, catalogVersion }) => {
      await assertValidType(type)
      return mutateGraph(graph, (g) => ({ id: ops.addNode(g, type, x, y, catalogVersion ?? 1) }))
    }),
  )

  server.registerTool(
    'move_node',
    {
      title: 'Move node',
      description:
        'Move a node to (x, y), its new CENTER position (same convention as add_node). Throws if the ' +
        'node id doesn’t exist. Re-evaluates which group (if any) it belongs to based on the new position.',
      inputSchema: { graph: graphArg, id: z.string(), x: z.number(), y: z.number() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id, x, y }) =>
      mutateGraph(graph, (g) => {
        ops.moveNode(g, id, x, y)
        return {}
      }),
    ),
  )

  server.registerTool(
    'set_node_label',
    {
      title: 'Set node label',
      description: 'Set a node’s display label (max 50 characters). Throws if the node id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string(), label: z.string() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id, label }) =>
      mutateGraph(graph, (g) => {
        ops.setNodeLabel(g, id, label)
        return {}
      }),
    ),
  )

  server.registerTool(
    'remove_node',
    {
      title: 'Remove node',
      description:
        'Remove a node. Any edges connected to it are removed too. Throws if the node id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id }) =>
      mutateGraph(graph, (g) => {
        ops.removeNode(g, id)
        return {}
      }),
    ),
  )

  server.registerTool(
    'add_edge',
    {
      title: 'Add edge',
      description:
        'Connect two existing nodes. Throws if `from`/`to` are the same node or either node id does ' +
        'not exist in this graph.',
      inputSchema: {
        graph: graphArg,
        from: z.string().describe('Source node id'),
        to: z.string().describe('Target node id'),
        fromAnchor: anchorSchema.nullable().optional(),
        toAnchor: anchorSchema.nullable().optional(),
      },
      outputSchema: { id: z.string(), ...graphRefOutput },
    },
    withErrorHandling(async ({ graph, from, to, fromAnchor, toAnchor }) =>
      mutateGraph(graph, (g) => ({ id: ops.addEdge(g, from, to, fromAnchor ?? null, toAnchor ?? null) })),
    ),
  )

  server.registerTool(
    'set_edge_style',
    {
      title: 'Set edge style',
      description: 'Set an edge’s line style. Throws if the edge id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string(), style: edgeStyleSchema },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id, style }) =>
      mutateGraph(graph, (g) => {
        ops.setEdgeStyle(g, id, style)
        return {}
      }),
    ),
  )

  server.registerTool(
    'set_edge_direction',
    {
      title: 'Set edge direction',
      description: 'Set which end(s) of an edge show an arrowhead. Throws if the edge id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string(), direction: edgeDirectionSchema },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id, direction }) =>
      mutateGraph(graph, (g) => {
        ops.setEdgeDirection(g, id, direction)
        return {}
      }),
    ),
  )

  server.registerTool(
    'set_edge_label',
    {
      title: 'Set edge label',
      description:
        'Set (or clear, with null) an edge’s label (max 30 characters). Throws if the edge id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string(), label: z.string().nullable() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id, label }) =>
      mutateGraph(graph, (g) => {
        ops.setEdgeLabel(g, id, label)
        return {}
      }),
    ),
  )

  server.registerTool(
    'remove_edge',
    {
      title: 'Remove edge',
      description: 'Remove an edge. Throws if the edge id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id }) =>
      mutateGraph(graph, (g) => {
        ops.removeEdge(g, id)
        return {}
      }),
    ),
  )

  server.registerTool(
    'add_group',
    {
      title: 'Add group',
      description:
        'Add a rectangular group at top-left (x, y) with the given width/height (min 60px each — ' +
        'unlike nodes, groups are anchored by their top-left corner, not their center). Any existing ' +
        'nodes whose center falls inside the rectangle are added to the group.',
      inputSchema: {
        graph: graphArg,
        x: z.number(),
        y: z.number(),
        width: z.number().positive(),
        height: z.number().positive(),
      },
      outputSchema: { id: z.string(), ...graphRefOutput },
    },
    withErrorHandling(async ({ graph, x, y, width, height }) =>
      mutateGraph(graph, (g) => ({ id: ops.addGroup(g, x, y, width, height) })),
    ),
  )

  server.registerTool(
    'move_group',
    {
      title: 'Move group',
      description:
        'Move a group by a relative offset (dx, dy) — NOT an absolute position. Its member nodes move ' +
        'with it. Throws if the group id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string(), dx: z.number(), dy: z.number() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id, dx, dy }) =>
      mutateGraph(graph, (g) => {
        ops.moveGroup(g, id, dx, dy)
        return {}
      }),
    ),
  )

  server.registerTool(
    'set_group_label',
    {
      title: 'Set group label',
      description:
        'Set (or clear, with null) a group’s label (max 30 characters). Throws if the group id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string(), label: z.string().nullable() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id, label }) =>
      mutateGraph(graph, (g) => {
        ops.setGroupLabel(g, id, label)
        return {}
      }),
    ),
  )

  server.registerTool(
    'remove_group',
    {
      title: 'Remove group',
      description: 'Remove a group. Its member nodes are kept, just ungrouped. Throws if the group id doesn’t exist.',
      inputSchema: { graph: graphArg, id: z.string() },
      outputSchema: graphRefOutput,
    },
    withErrorHandling(async ({ graph, id }) =>
      mutateGraph(graph, (g) => {
        ops.removeGroup(g, id)
        return {}
      }),
    ),
  )
}
