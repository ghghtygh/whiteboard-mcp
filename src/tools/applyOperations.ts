import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { assertValidType } from '../board/catalogCache.js'
import { GraphError } from '../board/errors.js'
import * as ops from '../board/ops.js'
import { anchorSchema, edgeDirectionSchema, edgeStyleSchema, graphArg, graphRefOutput } from './schemas.js'
import { mutateGraph, withErrorHandling } from './util.js'

// "$ref:<name>" 로 같은 배치 안에서 아직 실제 id 를 모르는 노드/엣지/그룹을 가리킬 수 있게
// 한다 — add_node 에 ref: "api" 를 주면, 뒤따르는 add_edge 의 from/to 에
// "$ref:api" 를 넣어 실제 id 가 나오기 전에도 연결을 표현할 수 있다.
const REF_PREFIX = '$ref:'
const idOrRef = z
  .string()
  .describe('A real id from an earlier response, or "$ref:<name>" for a `ref` set earlier in this same batch')

const addNodeOp = z.object({
  op: z.literal('add_node'),
  ref: z.string().optional().describe('Optional local name to refer to this node later in this batch'),
  type: z.string(),
  x: z.number(),
  y: z.number(),
  catalogVersion: z.number().int().optional(),
})
const moveNodeOp = z.object({ op: z.literal('move_node'), id: idOrRef, x: z.number(), y: z.number() })
const setNodeLabelOp = z.object({ op: z.literal('set_node_label'), id: idOrRef, label: z.string() })
const removeNodeOp = z.object({ op: z.literal('remove_node'), id: idOrRef })
const addEdgeOp = z.object({
  op: z.literal('add_edge'),
  ref: z.string().optional().describe('Optional local name to refer to this edge later in this batch'),
  from: idOrRef,
  to: idOrRef,
  fromAnchor: anchorSchema.nullable().optional(),
  toAnchor: anchorSchema.nullable().optional(),
})
const setEdgeStyleOp = z.object({ op: z.literal('set_edge_style'), id: idOrRef, style: edgeStyleSchema })
const setEdgeDirectionOp = z.object({ op: z.literal('set_edge_direction'), id: idOrRef, direction: edgeDirectionSchema })
const setEdgeLabelOp = z.object({ op: z.literal('set_edge_label'), id: idOrRef, label: z.string().nullable() })
const removeEdgeOp = z.object({ op: z.literal('remove_edge'), id: idOrRef })
const addGroupOp = z.object({
  op: z.literal('add_group'),
  ref: z.string().optional().describe('Optional local name to refer to this group later in this batch'),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
})
const moveGroupOp = z.object({ op: z.literal('move_group'), id: idOrRef, dx: z.number(), dy: z.number() })
const setGroupLabelOp = z.object({ op: z.literal('set_group_label'), id: idOrRef, label: z.string().nullable() })
const removeGroupOp = z.object({ op: z.literal('remove_group'), id: idOrRef })

const operationSchema = z.discriminatedUnion('op', [
  addNodeOp,
  moveNodeOp,
  setNodeLabelOp,
  removeNodeOp,
  addEdgeOp,
  setEdgeStyleOp,
  setEdgeDirectionOp,
  setEdgeLabelOp,
  removeEdgeOp,
  addGroupOp,
  moveGroupOp,
  setGroupLabelOp,
  removeGroupOp,
])

const operationResultSchema = z.object({ op: z.string(), id: z.string().optional() })

export function registerApplyOperationsTool(server: McpServer) {
  server.registerTool(
    'apply_operations',
    {
      title: 'Apply multiple graph operations at once',
      description:
        'Run a batch of node/edge/group operations as one transaction — for building or changing ' +
        'several things in a single call instead of many round trips. Each add_node/add_edge/add_group ' +
        'entry can carry a `ref` (a name you invent); later entries in the SAME batch may then use ' +
        '"$ref:<name>" wherever an id is expected — e.g. add a node with ref "api", add another with ' +
        'ref "db", then add_edge with from: "$ref:api", to: "$ref:db" — without needing to know their ' +
        'real ids yet. Operations run in the order given; the whole batch fails together if any one ' +
        'operation is invalid (unknown type, unknown id/ref, self-edge, etc.).',
      inputSchema: { graph: graphArg, operations: z.array(operationSchema).min(1) },
      outputSchema: { results: z.array(operationResultSchema), ...graphRefOutput },
    },
    withErrorHandling(async ({ graph, operations }) =>
      mutateGraph(graph, async (g) => {
        const refs: Record<string, string> = {}
        const resolve = (value: string): string => {
          if (!value.startsWith(REF_PREFIX)) return value
          const name = value.slice(REF_PREFIX.length)
          const id = refs[name]
          if (!id) {
            throw new GraphError(
              `Unknown ref "${name}" — it must be set by an earlier add_node/add_edge/add_group in this same batch.`,
              'UNKNOWN_REF',
            )
          }
          return id
        }

        const results: { op: string; id?: string }[] = []
        for (const operation of operations) {
          switch (operation.op) {
            case 'add_node': {
              await assertValidType(operation.type)
              const id = ops.addNode(g, operation.type, operation.x, operation.y, operation.catalogVersion ?? 1)
              if (operation.ref) refs[operation.ref] = id
              results.push({ op: operation.op, id })
              break
            }
            case 'move_node':
              ops.moveNode(g, resolve(operation.id), operation.x, operation.y)
              results.push({ op: operation.op })
              break
            case 'set_node_label':
              ops.setNodeLabel(g, resolve(operation.id), operation.label)
              results.push({ op: operation.op })
              break
            case 'remove_node':
              ops.removeNode(g, resolve(operation.id))
              results.push({ op: operation.op })
              break
            case 'add_edge': {
              const id = ops.addEdge(
                g,
                resolve(operation.from),
                resolve(operation.to),
                operation.fromAnchor ?? null,
                operation.toAnchor ?? null,
              )
              if (operation.ref) refs[operation.ref] = id
              results.push({ op: operation.op, id })
              break
            }
            case 'set_edge_style':
              ops.setEdgeStyle(g, resolve(operation.id), operation.style)
              results.push({ op: operation.op })
              break
            case 'set_edge_direction':
              ops.setEdgeDirection(g, resolve(operation.id), operation.direction)
              results.push({ op: operation.op })
              break
            case 'set_edge_label':
              ops.setEdgeLabel(g, resolve(operation.id), operation.label)
              results.push({ op: operation.op })
              break
            case 'remove_edge':
              ops.removeEdge(g, resolve(operation.id))
              results.push({ op: operation.op })
              break
            case 'add_group': {
              const id = ops.addGroup(g, operation.x, operation.y, operation.width, operation.height)
              if (operation.ref) refs[operation.ref] = id
              results.push({ op: operation.op, id })
              break
            }
            case 'move_group':
              ops.moveGroup(g, resolve(operation.id), operation.dx, operation.dy)
              results.push({ op: operation.op })
              break
            case 'set_group_label':
              ops.setGroupLabel(g, resolve(operation.id), operation.label)
              results.push({ op: operation.op })
              break
            case 'remove_group':
              ops.removeGroup(g, resolve(operation.id))
              results.push({ op: operation.op })
              break
          }
        }
        return { results }
      }),
    ),
  )
}
