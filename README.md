# whiteboard-mcp

`../whiteboard-web` 보드를 [MCP](https://modelcontextprotocol.io) 클라이언트(Claude 등)에 노출하는
remote MCP 서버. Node.js / TypeScript, Streamable HTTP 전송.

## 왜 별도 서비스인가

보드 콘텐츠(노드/엣지/그룹)는 `../whiteboard-web` 이 만드는 Yjs CRDT 문서로 저장된다.
`../whiteboard-server`(Java)와 `../whiteboard-socket`(Go)는 둘 다 이 문서의 바이트를
**해석하지 않는다** — 저장·중계만 한다. Yjs 를 실제로 디코드/인코드할 수 있는 곳은
JS 런타임뿐이라, 이 서버가 그 역할을 맡는다.

## 아키텍처

```
MCP 클라이언트 (Claude 등)
  │ Streamable HTTP, Authorization: Bearer <whiteboard PAT 또는 access token>
  ▼
whiteboard-mcp (이 서비스)
  │ REST (같은 Bearer 토큰 그대로 전달)
  ▼
whiteboard-server  ──(공유 DB: board_snapshots / board_updates)──  whiteboard-socket
```

- **보드 메타데이터 도구**(list_boards, create_board, ...)는 whiteboard-server 의
  `/api/v1/boards`, `/api/v1/catalog` 를 그대로 프록시한다.
- **보드 콘텐츠 도구**(create_node, move_group, ...)는 `/api/v1/boards/{id}/export` 로
  현재 Yjs 문서(스냅샷+증분)를 받아 `yjs` 로 디코드 → `src/board/ops.ts` (whiteboard-web 의
  `src/canvas/ops.ts` 를 헤드리스로 포팅한 것)로 mutate → 전체 상태를 다시 인코드해
  `/api/v1/boards/{id}/import` 로 교체한다. import 는 whiteboard-server 가 이미 구현해 둔
  "접속 중인 세션에도 실시간 반영"(Redis publish → whiteboard-socket) 경로를 그대로 탄다 —
  이 서버는 y-websocket 프로토콜을 직접 구현하지 않는다.
- **인증**은 매 HTTP 요청의 `Authorization` 헤더를 그대로 whiteboard-server 에 전달한다.
  권한 검사(보드 소유자/멤버 여부 등)는 100% whiteboard-server 몫이다. 이 서버는 세션이나
  사용자 정보를 저장하지 않는다(요청마다 새 `McpServer` 인스턴스를 만드는 stateless 모드 —
  `src/server.ts`).

## 실행

```bash
npm install
cp .env.example .env   # WHITEBOARD_API_ORIGIN 을 whiteboard-server 주소로
npm run dev             # http://localhost:3000/mcp
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `WHITEBOARD_API_ORIGIN` | `http://localhost:8080` | whiteboard-server REST 베이스 URL |
| `PORT` | `3000` | 이 서버가 리슨할 포트 |

### 헬스체크 (k8s probe)

| 경로 | 용도 |
|---|---|
| `GET /healthz` | livenessProbe |
| `GET /readyz` | readinessProbe |

## 인증 — 개인용 API 토큰(PAT)

whiteboard-web 에 로그인한 뒤 **API tokens** 페이지(`/settings/tokens`)에서 발급한다
(`wbpat_...` 형태). MCP 클라이언트 설정의 헤더에 그대로 넣으면 된다:

```json
{
  "mcpServers": {
    "whiteboard": {
      "url": "https://wb.gpglab.site/mcp",
      "headers": { "Authorization": "Bearer wbpat_..." }
    }
  }
}
```

PAT 는 기본 180일 만료이며, 폐기(revoke)하면 즉시 무효화된다(JWT 와 달리 서버가 해시를
대조해 검증하기 때문). 자세한 발급/검증 로직은 `../whiteboard-server` 의
`PersonalAccessTokenService` 참고.

## 제공 도구

**보드 관리**: `list_boards`, `get_board`, `create_board`, `rename_board`, `delete_board`,
`list_catalog`

**보드 콘텐츠**: `get_board_content`,
`create_node` / `move_node` / `set_node_label` / `delete_node`,
`create_edge` / `set_edge_style` / `set_edge_direction` / `set_edge_label` / `delete_edge`,
`create_group` / `move_group` / `set_group_label` / `delete_group`

노드 삭제 시 연결된 엣지 정리, 그룹 생성/이동 시 노드 자동 편입 같은 cross-cutting 규칙은
whiteboard-web 의 `ops.ts` 와 동일하게 `src/board/ops.ts` 안에서 보장된다 — 도구 핸들러가
직접 Y.Map 을 만지지 않는다.

## 검증

```bash
npm run typecheck
npm run build
```

별도 테스트 러너는 아직 없다. 로컬에서 whiteboard-server 를 띄운 뒤
(`../whiteboard-server && ./gradlew bootRun`) PAT 를 발급해 `curl` 로 Streamable HTTP
요청(`initialize` → `tools/list` → `tools/call`)을 보내보는 것이 가장 빠른 수동 검증이다.

## 배포

`Dockerfile`(멀티스테이지 → 경량 Node 런타임, non-root)로 `ghcr.io/ghghtygh/whiteboard-mcp` 에
이미지를 빌드한다. k8s 매니페스트는 `../k8s-manifests/apps/whiteboard-mcp` 참고 — Ingress 는
`wb.gpglab.site/mcp` 를 이 서비스로 라우팅한다.
