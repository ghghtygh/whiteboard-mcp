// whiteboard-web 의 src/canvas/geometry.ts 에서 쓰는 상수 중 문서 mutation 에 필요한 것만
// 가져왔다. 두 값(GRID, NODE_W/NODE_H)은 그쪽이 원본이니 바뀌면 여기도 맞춰야 한다.
export const GRID = 8
export const NODE_W = 80
export const NODE_H = 80

export function snap(v: number): number {
  return Math.round(v / GRID) * GRID
}
