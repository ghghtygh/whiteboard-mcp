import { nanoid } from 'nanoid'
import { NODE_H, NODE_W, snap } from './geometry.js'
import type { GraphSnapshot } from './graphCodec.js'
import type { Anchor, BoardEdge, BoardGroup, EdgeDirection, EdgeStyle } from './types.js'

// whiteboard-web 의 src/canvas/ops.ts 와 같은 cross-cutting 규칙(노드 삭제 시 엣지 정리,
// 그룹 생성/이동 시 노드 자동 편입)을 그대로 지키되, Yjs 문서가 아니라 인코딩/디코딩되는
// 순수 GraphSnapshot(plain object) 위에서 동작한다 — 이 서버는 이제 어떤 그래프도
// 서버에 들고 있지 않으므로 CRDT 가 필요 없다. 각 함수는 주어진 graph 를 그 자리에서
// mutate 한다(호출자가 매 MCP 요청마다 새로 디코드한 객체를 넘기므로 안전하다).

function containingGroup(groups: BoardGroup[], cx: number, cy: number): string | null {
  for (const g of groups) {
    if (cx >= g.x && cx <= g.x + g.width && cy >= g.y && cy <= g.y + g.height) return g.id
  }
  return null
}

/** x, y 는 노드 중심 좌표 — 드롭 지점 기준으로 상자를 배치하는 whiteboard-web 과 동일한 규약. */
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

/** x, y 는 노드 좌상단 좌표(저장 형식과 동일). 이동 후 그룹 소속을 자동 재계산한다. */
export function moveNode(g: GraphSnapshot, id: string, x: number, y: number): boolean {
  const node = g.nodes.find((n) => n.id === id)
  if (!node) return false
  node.x = snap(x)
  node.y = snap(y)
  node.groupId = containingGroup(g.groups, node.x + NODE_W / 2, node.y + NODE_H / 2)
  return true
}

export function setNodeLabel(g: GraphSnapshot, id: string, label: string): boolean {
  const node = g.nodes.find((n) => n.id === id)
  if (!node) return false
  node.label = label.slice(0, 50)
  return true
}

export function removeNode(g: GraphSnapshot, id: string): boolean {
  const idx = g.nodes.findIndex((n) => n.id === id)
  if (idx === -1) return false
  g.nodes.splice(idx, 1)
  // 끊긴 엣지도 함께 제거 — whiteboard-web 과 동일한 규칙.
  g.edges = g.edges.filter((e) => e.from !== id && e.to !== id)
  return true
}

export function addEdge(
  g: GraphSnapshot,
  from: string,
  to: string,
  fromAnchor: Anchor | null = null,
  toAnchor: Anchor | null = null,
): string | null {
  if (from === to) return null
  if (!g.nodes.some((n) => n.id === from) || !g.nodes.some((n) => n.id === to)) return null
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

export function setEdgeStyle(g: GraphSnapshot, id: string, style: EdgeStyle): boolean {
  const edge = g.edges.find((e) => e.id === id)
  if (!edge) return false
  edge.style = style
  return true
}

export function setEdgeDirection(g: GraphSnapshot, id: string, direction: EdgeDirection): boolean {
  const edge = g.edges.find((e) => e.id === id)
  if (!edge) return false
  edge.direction = direction
  return true
}

export function setEdgeLabel(g: GraphSnapshot, id: string, label: string | null): boolean {
  const edge = g.edges.find((e) => e.id === id)
  if (!edge) return false
  edge.label = label ? label.slice(0, 30) : null
  return true
}

export function removeEdge(g: GraphSnapshot, id: string): boolean {
  const idx = g.edges.findIndex((e) => e.id === id)
  if (idx === -1) return false
  g.edges.splice(idx, 1)
  return true
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
export function moveGroup(g: GraphSnapshot, id: string, dx: number, dy: number): boolean {
  const group = g.groups.find((x) => x.id === id)
  if (!group) return false
  group.x = snap(group.x + dx)
  group.y = snap(group.y + dy)
  for (const node of g.nodes) {
    if (node.groupId === id) {
      node.x = snap(node.x + dx)
      node.y = snap(node.y + dy)
    }
  }
  return true
}

export function setGroupLabel(g: GraphSnapshot, id: string, label: string | null): boolean {
  const group = g.groups.find((x) => x.id === id)
  if (!group) return false
  group.label = label ? label.slice(0, 30) : null
  return true
}

export function removeGroup(g: GraphSnapshot, id: string): boolean {
  const idx = g.groups.findIndex((x) => x.id === id)
  if (idx === -1) return false
  g.groups.splice(idx, 1)
  for (const node of g.nodes) {
    if (node.groupId === id) node.groupId = null
  }
  return true
}
