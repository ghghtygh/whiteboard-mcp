// whiteboard-web 의 src/types/domain.ts 중 보드 콘텐츠(Yjs 문서) 관련 타입만 가져왔다.
export type Anchor = 'top' | 'right' | 'bottom' | 'left'
export type EdgeStyle = 'solid' | 'dashed' | 'dotted'
export type EdgeDirection = 'forward' | 'backward' | 'both' | 'none'

export interface BoardNode {
  id: string
  type: string
  label: string
  x: number
  y: number
  groupId: string | null
  catalogVersion: number
}

export interface BoardEdge {
  id: string
  from: string
  to: string
  fromAnchor: Anchor | null
  toAnchor: Anchor | null
  label: string | null
  style: EdgeStyle
  direction: EdgeDirection
}

export interface BoardGroup {
  id: string
  label: string | null
  x: number
  y: number
  width: number
  height: number
  color: string | null
}
