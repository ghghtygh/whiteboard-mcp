// whiteboard-server 의 REST API 베이스 URL. save_as_board 도구와 list_catalog 도구에서만
// 쓰인다 — 그 외 모든 그래프 mutation 은 이 서버를 전혀 호출하지 않는다.
export const WHITEBOARD_API_ORIGIN =
  (process.env.WHITEBOARD_API_ORIGIN ?? 'http://localhost:8080').replace(/\/$/, '')

// whiteboard-web 의 공개 오리진 — 도구가 반환하는 "/view/{token}" 공유 링크를 절대 URL로
// 만드는 데 쓴다.
export const WHITEBOARD_WEB_ORIGIN =
  (process.env.WHITEBOARD_WEB_ORIGIN ?? 'http://localhost:5173').replace(/\/$/, '')

export const PORT = Number(process.env.PORT ?? 3000)

export function viewUrl(token: string): string {
  return `${WHITEBOARD_WEB_ORIGIN}/view/${token}`
}
