import * as Y from 'yjs'
import { createBoardDoc, type BoardDoc } from './doc.js'
import type { WhiteboardClient } from '../whiteboardClient.js'

/**
 * whiteboard-server 의 export 엔드포인트에서 스냅샷 + 증분 update 를 받아 하나의 Y.Doc 으로
 * 합친다. Yjs 적용은 멱등이라 순서와 무관하게 항상 안전하다(whiteboard-socket 의 SyncStep1
 * 처리와 같은 전제).
 */
export async function loadBoardDoc(client: WhiteboardClient, boardId: string): Promise<BoardDoc> {
  const stored = await client.exportDocument(boardId)
  const doc = createBoardDoc()
  if (stored.snapshot) {
    Y.applyUpdate(doc.ydoc, Buffer.from(stored.snapshot, 'base64'))
  }
  for (const update of stored.updates) {
    Y.applyUpdate(doc.ydoc, Buffer.from(update, 'base64'))
  }
  return doc
}

/**
 * 현재 Y.Doc 전체 상태를 하나의 스냅샷으로 인코딩해 import 엔드포인트로 교체한다.
 * whiteboard-server 가 이미 하는 일(라이브 세션에 Redis 로 반영)을 그대로 재사용한다 —
 * 이 서버는 y-websocket 프로토콜을 직접 구현하지 않는다.
 */
export async function saveBoardDoc(client: WhiteboardClient, boardId: string, doc: BoardDoc): Promise<void> {
  const snapshot = Y.encodeStateAsUpdate(doc.ydoc)
  await client.importDocument(boardId, Buffer.from(snapshot).toString('base64'))
}
