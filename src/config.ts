// whiteboard-server 의 REST API 베이스 URL. k8s 안에서는 서비스명으로, 로컬에서는
// http://localhost:8080 으로 접근한다. 끝의 슬래시는 제거해 baseURL 결합을 단순하게 한다.
export const WHITEBOARD_API_ORIGIN =
  (process.env.WHITEBOARD_API_ORIGIN ?? 'http://localhost:8080').replace(/\/$/, '')

export const PORT = Number(process.env.PORT ?? 3000)

// MCP 클라이언트는 인증 없이(자유롭게) 접속하지만, 이 서버가 whiteboard-server 를
// 호출할 땐 여전히 토큰이 필요하다 — 그래서 이 서버 전용으로 만든 "서비스 계정"의
// 개인용 API 토큰(PAT) 하나를 서버 환경변수로 고정해 모든 요청에 쓴다.
// 그 계정이 멤버가 아닌 보드(다른 실사용자가 만든 보드)는 whiteboard-server 의
// 기존 멤버십 검사에 의해 여전히 접근할 수 없다 — MCP 를 여는 것과 계정 격리는 별개다.
export const WHITEBOARD_SERVICE_TOKEN = process.env.WHITEBOARD_SERVICE_TOKEN ?? ''

if (!WHITEBOARD_SERVICE_TOKEN) {
  throw new Error(
    'WHITEBOARD_SERVICE_TOKEN is not set. Issue a PAT for the dedicated whiteboard-mcp service ' +
      'account (see README “Authentication”) and set it as this env var before starting the server.',
  )
}
