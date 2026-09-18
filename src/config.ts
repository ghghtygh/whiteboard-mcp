// whiteboard-server 의 REST API 베이스 URL. k8s 안에서는 서비스명으로, 로컬에서는
// http://localhost:8080 으로 접근한다. 끝의 슬래시는 제거해 baseURL 결합을 단순하게 한다.
export const WHITEBOARD_API_ORIGIN =
  (process.env.WHITEBOARD_API_ORIGIN ?? 'http://localhost:8080').replace(/\/$/, '')

export const PORT = Number(process.env.PORT ?? 3000)
