import * as Y from 'yjs'
import { nanoid } from 'nanoid'
import type { BoardDoc } from './doc.js'
import { NODE_H, NODE_W, snap } from './geometry.js'
import type { Anchor, BoardEdge, BoardGroup, BoardNode, EdgeDirection, EdgeStyle } from './types.js'

// 이 파일은 whiteboard-web 의 src/canvas/ops.ts 를 헤드리스(서버) 환경으로 포팅한 것이다.
// 목적은 동일하다: 모든 mutation 이 하나의 함수를 거치게 해서, 노드 삭제 시 끊긴 엣지 정리,
// 그룹 이동 시 자식 노드 동반 이동, 노드 이동 시 그룹 자동 편입 같은 cross-cutting 규칙을
// 원본 앱과 똑같이 지킨다. 원본에 있는 UndoManager/origin 인자는 여기선 필요 없어 뺐다.

function mapToNode(map: Y.Map<unknown>): BoardNode {
  return {
    id: map.get('id') as string,
    type: map.get('type') as string,
    label: (map.get('label') as string) ?? '',
    x: map.get('x') as number,
    y: map.get('y') as number,
    groupId: (map.get('groupId') as string | null) ?? null,
    catalogVersion: (map.get('catalogVersion') as number) ?? 1,
  }
}

function mapToEdge(map: Y.Map<unknown>): BoardEdge {
  return {
    id: map.get('id') as string,
    from: map.get('from') as string,
    to: map.get('to') as string,
    fromAnchor: (map.get('fromAnchor') as Anchor | null) ?? null,
    toAnchor: (map.get('toAnchor') as Anchor | null) ?? null,
    label: (map.get('label') as string | null) ?? null,
    style: (map.get('style') as EdgeStyle) ?? 'solid',
    direction: (map.get('direction') as EdgeDirection) ?? 'forward',
  }
}

function mapToGroup(map: Y.Map<unknown>): BoardGroup {
  return {
    id: map.get('id') as string,
    label: (map.get('label') as string | null) ?? null,
    x: map.get('x') as number,
    y: map.get('y') as number,
    width: map.get('width') as number,
    height: map.get('height') as number,
    color: (map.get('color') as string | null) ?? null,
  }
}

export function readNodes(doc: BoardDoc): BoardNode[] {
  const out: BoardNode[] = []
  doc.nodes.forEach((m) => out.push(mapToNode(m)))
  return out
}

export function readEdges(doc: BoardDoc): BoardEdge[] {
  const out: BoardEdge[] = []
  doc.edges.forEach((m) => out.push(mapToEdge(m)))
  return out
}

export function readGroups(doc: BoardDoc): BoardGroup[] {
  const out: BoardGroup[] = []
  doc.groups.forEach((m) => out.push(mapToGroup(m)))
  return out
}

export function getNode(doc: BoardDoc, id: string): BoardNode | null {
  const m = doc.nodes.get(id)
  return m ? mapToNode(m) : null
}

export function getEdge(doc: BoardDoc, id: string): BoardEdge | null {
  const m = doc.edges.get(id)
  return m ? mapToEdge(m) : null
}

export function getGroup(doc: BoardDoc, id: string): BoardGroup | null {
  const m = doc.groups.get(id)
  return m ? mapToGroup(m) : null
}

function containingGroup(doc: BoardDoc, cx: number, cy: number): string | null {
  let found: string | null = null
  doc.groups.forEach((gm, gid) => {
    const gx = gm.get('x') as number
    const gy = gm.get('y') as number
    const gw = gm.get('width') as number
    const gh = gm.get('height') as number
    if (cx >= gx && cx <= gx + gw && cy >= gy && cy <= gy + gh) {
      found = gid
    }
  })
  return found
}

/** x, y 는 노드 중심 좌표 — 드롭 지점 기준으로 상자를 배치하는 원본 앱과 동일한 규약. */
export function createNode(doc: BoardDoc, type: string, x: number, y: number, catalogVersion = 1): string {
  const id = nanoid(10)
  doc.ydoc.transact(() => {
    const ymap = new Y.Map<unknown>()
    ymap.set('id', id)
    ymap.set('type', type)
    ymap.set('label', '')
    ymap.set('x', snap(x - NODE_W / 2))
    ymap.set('y', snap(y - NODE_H / 2))
    ymap.set('groupId', containingGroup(doc, x, y))
    ymap.set('catalogVersion', catalogVersion)
    doc.nodes.set(id, ymap)
  })
  return id
}

/** x, y 는 노드 좌상단 좌표(저장 형식과 동일). 이동 후 그룹 소속을 자동 재계산한다. */
export function moveNode(doc: BoardDoc, id: string, x: number, y: number): boolean {
  const map = doc.nodes.get(id)
  if (!map) return false
  doc.ydoc.transact(() => {
    map.set('x', snap(x))
    map.set('y', snap(y))
    const cx = (map.get('x') as number) + NODE_W / 2
    const cy = (map.get('y') as number) + NODE_H / 2
    const gid = containingGroup(doc, cx, cy)
    if ((map.get('groupId') as string | null) !== gid) {
      map.set('groupId', gid)
    }
  })
  return true
}

export function setNodeLabel(doc: BoardDoc, id: string, label: string): boolean {
  const map = doc.nodes.get(id)
  if (!map) return false
  doc.ydoc.transact(() => {
    map.set('label', label.slice(0, 50))
  })
  return true
}

export function deleteNode(doc: BoardDoc, id: string): boolean {
  if (!doc.nodes.has(id)) return false
  doc.ydoc.transact(() => {
    doc.nodes.delete(id)
    // 끊긴 엣지도 함께 제거 — 원본 앱과 동일한 규칙.
    doc.edges.forEach((edge, edgeId) => {
      if (edge.get('from') === id || edge.get('to') === id) {
        doc.edges.delete(edgeId)
      }
    })
  })
  return true
}

export function createEdge(
  doc: BoardDoc,
  from: string,
  to: string,
  fromAnchor: Anchor | null = null,
  toAnchor: Anchor | null = null,
): string | null {
  if (from === to) return null
  if (!doc.nodes.has(from) || !doc.nodes.has(to)) return null
  const id = nanoid(10)
  doc.ydoc.transact(() => {
    const ymap = new Y.Map<unknown>()
    ymap.set('id', id)
    ymap.set('from', from)
    ymap.set('to', to)
    ymap.set('fromAnchor', fromAnchor)
    ymap.set('toAnchor', toAnchor)
    ymap.set('label', null)
    ymap.set('style', 'solid' satisfies EdgeStyle)
    ymap.set('direction', 'forward' satisfies EdgeDirection)
    doc.edges.set(id, ymap)
  })
  return id
}

export function setEdgeStyle(doc: BoardDoc, id: string, style: EdgeStyle): boolean {
  const map = doc.edges.get(id)
  if (!map) return false
  doc.ydoc.transact(() => map.set('style', style))
  return true
}

export function setEdgeDirection(doc: BoardDoc, id: string, direction: EdgeDirection): boolean {
  const map = doc.edges.get(id)
  if (!map) return false
  doc.ydoc.transact(() => map.set('direction', direction))
  return true
}

export function setEdgeLabel(doc: BoardDoc, id: string, label: string | null): boolean {
  const map = doc.edges.get(id)
  if (!map) return false
  doc.ydoc.transact(() => map.set('label', label ? label.slice(0, 30) : null))
  return true
}

export function deleteEdge(doc: BoardDoc, id: string): boolean {
  if (!doc.edges.has(id)) return false
  doc.ydoc.transact(() => doc.edges.delete(id))
  return true
}

export function createGroup(doc: BoardDoc, x: number, y: number, width: number, height: number): string {
  const id = nanoid(10)
  doc.ydoc.transact(() => {
    const gx = snap(x)
    const gy = snap(y)
    const gw = Math.max(60, snap(width))
    const gh = Math.max(60, snap(height))
    const ymap = new Y.Map<unknown>()
    ymap.set('id', id)
    ymap.set('label', null)
    ymap.set('x', gx)
    ymap.set('y', gy)
    ymap.set('width', gw)
    ymap.set('height', gh)
    ymap.set('color', null)
    doc.groups.set(id, ymap)
    // 새로 만든 그룹이 기존 노드를 포함하면 편입 — 원본 앱과 동일한 규칙.
    doc.nodes.forEach((nm) => {
      const nx = (nm.get('x') as number) + NODE_W / 2
      const ny = (nm.get('y') as number) + NODE_H / 2
      if (nx >= gx && nx <= gx + gw && ny >= gy && ny <= gy + gh) {
        nm.set('groupId', id)
      }
    })
  })
  return id
}

/** dx, dy 는 이동량(delta) — 원본 앱의 드래그 이동과 동일한 규약. 자식 노드도 함께 이동한다. */
export function moveGroup(doc: BoardDoc, id: string, dx: number, dy: number): boolean {
  const map = doc.groups.get(id)
  if (!map) return false
  doc.ydoc.transact(() => {
    map.set('x', snap((map.get('x') as number) + dx))
    map.set('y', snap((map.get('y') as number) + dy))
    doc.nodes.forEach((nm) => {
      if (nm.get('groupId') === id) {
        nm.set('x', snap((nm.get('x') as number) + dx))
        nm.set('y', snap((nm.get('y') as number) + dy))
      }
    })
  })
  return true
}

export function setGroupLabel(doc: BoardDoc, id: string, label: string | null): boolean {
  const map = doc.groups.get(id)
  if (!map) return false
  doc.ydoc.transact(() => map.set('label', label ? label.slice(0, 30) : null))
  return true
}

export function deleteGroup(doc: BoardDoc, id: string): boolean {
  if (!doc.groups.has(id)) return false
  doc.ydoc.transact(() => {
    doc.groups.delete(id)
    doc.nodes.forEach((nm) => {
      if (nm.get('groupId') === id) nm.set('groupId', null)
    })
  })
  return true
}
