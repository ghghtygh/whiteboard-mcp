import * as Y from 'yjs'

// whiteboard-web 의 src/collab/doc.ts 와 동일한 BoardDoc 구조.
// 이 서버는 whiteboard-web 클라이언트처럼 Y.Doc 을 직접 다뤄 보드 콘텐츠를 읽고 쓴다.
export interface BoardDoc {
  ydoc: Y.Doc
  nodes: Y.Map<Y.Map<unknown>>
  edges: Y.Map<Y.Map<unknown>>
  groups: Y.Map<Y.Map<unknown>>
}

export function createBoardDoc(): BoardDoc {
  const ydoc = new Y.Doc()
  return {
    ydoc,
    nodes: ydoc.getMap('nodes'),
    edges: ydoc.getMap('edges'),
    groups: ydoc.getMap('groups'),
  }
}
