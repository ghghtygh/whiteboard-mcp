import * as Y from 'yjs'
import { createBoardDoc } from './doc.js'
import type { GraphSnapshot } from './graphCodec.js'

/**
 * GraphSnapshot(plain object) 을 whiteboard-server 의 /boards/{id}/import 가 기대하는
 * Yjs 스냅샷(base64)으로 바꾼다. save_as_board 도구(선택적 브릿지)에서만 쓰인다 — 그 외
 * 모든 그래프 mutation 은 Yjs 를 전혀 거치지 않는다.
 */
export function graphToYjsSnapshotBase64(graph: GraphSnapshot): string {
  const doc = createBoardDoc()
  doc.ydoc.transact(() => {
    for (const node of graph.nodes) {
      const map = new Y.Map<unknown>()
      map.set('id', node.id)
      map.set('type', node.type)
      map.set('label', node.label)
      map.set('x', node.x)
      map.set('y', node.y)
      map.set('groupId', node.groupId)
      map.set('catalogVersion', node.catalogVersion)
      doc.nodes.set(node.id, map)
    }
    for (const edge of graph.edges) {
      const map = new Y.Map<unknown>()
      map.set('id', edge.id)
      map.set('from', edge.from)
      map.set('to', edge.to)
      map.set('fromAnchor', edge.fromAnchor)
      map.set('toAnchor', edge.toAnchor)
      map.set('label', edge.label)
      map.set('style', edge.style)
      map.set('direction', edge.direction)
      doc.edges.set(edge.id, map)
    }
    for (const group of graph.groups) {
      const map = new Y.Map<unknown>()
      map.set('id', group.id)
      map.set('label', group.label)
      map.set('x', group.x)
      map.set('y', group.y)
      map.set('width', group.width)
      map.set('height', group.height)
      map.set('color', group.color)
      doc.groups.set(group.id, map)
    }
  })
  const update = Y.encodeStateAsUpdate(doc.ydoc)
  doc.ydoc.destroy()
  return toBase64(update)
}

// whiteboard-server 는 표준 Base64(+/, 패딩 있음, java.util.Base64.getDecoder())로 디코드하므로
// graphCodec.ts 의 base64url 인코더와는 다른 알파벳을 써야 한다. 큰 배열도 안전하도록 청크 단위로 처리.
function toBase64(bytes: Uint8Array): string {
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}
