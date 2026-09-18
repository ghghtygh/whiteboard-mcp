import { nanoid } from 'nanoid'
import { notFound, GraphError } from './errors.js'
import { NODE_H, NODE_W, snap } from './geometry.js'
import type { GraphSnapshot } from './graphCodec.js'
import type { Anchor, BoardEdge, BoardGroup, BoardNode, EdgeDirection, EdgeStyle } from './types.js'

// whiteboard-web 의 src/canvas/ops.ts 와 같은 cross-cutting 규칙(엣지 정리, 그룹 자동 편입)을
// 순수 GraphSnapshot(plain object) 위에서 지킨다 — 실시간 문서가 없으니 Yjs/CRDT 는 필요 없다.
// 모든 함수는 존재하지 않는 id 를 받으면 조용히 무시하지 않고 GraphError 를 던진다 — 호출자
// (MCP 도구)가 그 실패를 그대로 클라이언트 에러로 전달한다.
//
// 좌표 규약: addNode 와 moveNode 는 둘 다 노드의 "중심" 좌표를 받는다(원래 whiteboard-web 의
// moveNode 는 저장 형식과 같은 좌상단을 받았지만, LLM 이 두 도구를 구분해서 기억할 이유가
// 없어 이 서버에서는 통일했다). addGroup/moveGroup 은 원래부터 좌상단/델타라 그대로 둔다.

function findNode(g: GraphSnapshot, id: string): BoardNode {
  const node = g.nodes.find((n) => n.id === id)
  if (!node) notFound('node', id)
  return node
}

function findEdge(g: GraphSnapshot, id: string): BoardEdge {
  const edge = g.edges.find((e) => e.id === id)
  if (!edge) notFound('edge', id)
  return edge
}

function findGroup(g: GraphSnapshot, id: string): BoardGroup {
  const group = g.groups.find((x) => x.id === id)
  if (!group) notFound('group', id)
  return group
}

function containingGroup(groups: BoardGroup[], cx: number, cy: number): string | null {
  for (const g of groups) {
    if (cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height) return g.id
  }
  return null
}

/** x, y 는 노드 중심 좌표. */
export function addNode(g: GraphSnapshot, type: string, x: number, y: number, catalogVersion = 1): string {
  const id = nanoid(10)
  g.nodes.push({
    id,
    type,
    label: '',
    x: snap(x - NODE_W / 2),
    y: snap(y - NODE_H / 2),
    groupId: containingGroup(g.groups, x, y),
    catalogVersion,
  })
  return id
}

/** x, y 는 노드 중심 좌표(addNode 와 동일한 규약). 이동 후 그룹 소속을 자동 재계산한다. */
export function moveNode(g: GraphSnapshot, id: string, x: number, y: number): void {
  const node = findNode(g, id)
  node.x = snap(x - NODE_W / 2)
  node.y = snap(y - NODE_H / 2)
  node.groupId = containingGroup(g.groups, x, y)
}

export function setNodeLabel(g: GraphSnapshot, id: string, label: string): void {
  findNode(g, id).label = label.slice(0, 50)
}

export function removeNode(g: GraphSnapshot, id: string): void {
  const idx = g.nodes.findIndex((n) => n.id === id)
  if (idx === -1) notFound('node', id)
  g.nodes.splice(idx, 1)
  // 끊긴 엣지도 함께 제거 — whiteboard-web 과 동일한 규칙.
  g.edges = g.edges.filter((e) => e.from !== id && e.to !== id)
}

export function addEdge(
  g: GraphSnapshot,
  from: string,
  to: string,
  fromAnchor: Anchor | null = null,
  toAnchor: Anchor | null = null,
): string {
  if (from === to) throw new GraphError('Cannot connect a node to itself.', 'INVALID_EDGE')
  if (!g.nodes.some((n) => n.id === from)) notFound('node', from)
  if (!g.nodes.some((n) => n.id === to)) notFound('node', to)
  const id = nanoid(10)
  const edge: BoardEdge = {
    id,
    from,
    to,
    fromAnchor,
    toAnchor,
    label: null,
    style: 'solid',
    direction: 'forward',
  }
  g.edges.push(edge)
  return id
}

export function setEdgeStyle(g: GraphSnapshot, id: string, style: EdgeStyle): void {
  findEdge(g, id).style = style
}

export function setEdgeDirection(g: GraphSnapshot, id: string, direction: EdgeDirection): void {
  findEdge(g, id).direction = direction
}

export function setEdgeLabel(g: GraphSnapshot, id: string, label: string | null): void {
  findEdge(g, id).label = label ? label.slice(0, 30) : null
}

export function removeEdge(g: GraphSnapshot, id: string): void {
  const idx = g.edges.findIndex((e) => e.id === id)
  if (idx === -1) notFound('edge', id)
  g.edges.splice(idx, 1)
}

export function addGroup(g: GraphSnapshot, x: number, y: number, width: number, height: number): string {
  const id = nanoid(10)
  const gx = snap(x)
  const gy = snap(y)
  const gw = Math.max(60, snap(width))
  const gh = Math.max(60, snap(height))
  g.groups.push({ id, label: null, x: gx, y: gy, width: gw, height: gh, color: null })
  // 새로 만든 그룹이 기존 노드를 포함하면 편입 — whiteboard-web 과 동일한 규칙.
  for (const node of g.nodes) {
    const nx = node.x + NODE_W / 2
    const ny = node.y + NODE_H / 2
    if (nx >= gx && nx <= gx + gw && ny >= gy && ny <= gy + gh) node.groupId = id
  }
  return id
}

/** dx, dy 는 이동량(delta). 자식 노드도 함께 이동한다. */
export function moveGroup(g: GraphSnapshot, id: string, dx: number, dy: number): void {
  const group = findGroup(g, id)
  group.x = snap(group.x + dx)
  group.y = snap(group.y + dy)
  for (const node of g.nodes) {
    if (node.groupId === id) {
      node.x = snap(node.x + dx)
      node.y = snap(node.y + dy)
    }
  }
}

export function setGroupLabel(g: GraphSnapshot, id: string, label: string | null): void {
  findGroup(g, id).label = label ? label.slice(0, 30) : null
}

export function removeGroup(g: GraphSnapshot, id: string): void {
  const idx = g.groups.findIndex((x) => x.id === id)
  if (idx === -1) notFound('group', id)
  g.groups.splice(idx, 1)
  for (const node of g.nodes) {
    if (node.groupId === id) node.groupId = null
  }
}
