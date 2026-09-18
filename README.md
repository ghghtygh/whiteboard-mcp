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
MCP 클라이언트 (Claude 등, 인증 없음 — 누구나 접속 가능)
  │ Streamable HTTP
  ▼
whiteboard-mcp (이 서비스)
  │ REST, Authorization: Bearer <이 서버 전용 서비스 계정의 고정 PAT>
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
- **인증 모델**: MCP 클라이언트는 인증하지 않는다 — 누구나 바로 접속해 도구를 호출할 수
  있다. 대신 이 서버가 whiteboard-server 를 호출할 땐 항상 같은 **고정 서비스 계정 PAT**
  (`WHITEBOARD_SERVICE_TOKEN` 환경변수)를 쓴다. 즉 모든 MCP 호출은 결국 "이 서비스 계정"
  하나의 권한으로 실행된다 — 다른 실사용자 계정의 보드와는 완전히 분리된다 (자세한 내용은
  아래 "인증 — 서비스 계정" 참고).

## 실행

```bash
npm install
cp .env.example .env   # WHITEBOARD_API_ORIGIN 을 whiteboard-server 주소로
npm run dev             # http://localhost:3000/mcp
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `WHITEBOARD_API_ORIGIN` | `http://localhost:8080` | whiteboard-server REST 베이스 URL |
| `WHITEBOARD_SERVICE_TOKEN` | (필수) | 서비스 계정 PAT — 없으면 기동 시 즉시 실패한다 |
| `PORT` | `3000` | 이 서버가 리슨할 포트 |

### 헬스체크 (k8s probe)

| 경로 | 용도 |
|---|---|
| `GET /healthz` | livenessProbe |
| `GET /readyz` | readinessProbe |

## 인증 — 서비스 계정

이 MCP 엔드포인트는 **인증을 요구하지 않는다** — `https://wb.gpglab.site/mcp` 에 누구나
바로 접속해 도구를 호출할 수 있다:

```json
{
  "mcpServers": {
    "whiteboard": {
      "url": "https://wb.gpglab.site/mcp"
    }
  }
}
```

대신 서버 자신이 whiteboard-server 를 호출할 때 쓰는 **전용 서비스 계정**이 하나 있고,
그 계정의 PAT 를 배포 시 `WHITEBOARD_SERVICE_TOKEN` 으로 고정해 둔다. 최초 설정:

```bash
# 1) 서비스 전용 계정 하나를 가입시킨다 (예: mcp-service@wb.gpglab.site)
curl -X POST https://wb.gpglab.site/api/v1/auth/signup -H 'Content-Type: application/json' \
  -d '{"email":"mcp-service@wb.gpglab.site","name":"MCP Service","password":"<강한 비밀번호>"}'

# 2) 로그인해서 access token 을 받고
curl -X POST https://wb.gpglab.site/api/v1/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"mcp-service@wb.gpglab.site","password":"<강한 비밀번호>"}'

# 3) 그 access token 으로 PAT 를 발급한다 (whiteboard-web /settings/tokens 로도 가능)
curl -X POST https://wb.gpglab.site/api/v1/auth/tokens -H "Authorization: Bearer <access token>" \
  -H 'Content-Type: application/json' -d '{"name":"whiteboard-mcp"}'
```

발급된 `wbpat_...` 값을 `k8s-manifests/apps/whiteboard-mcp/secret.yaml` 의
`WHITEBOARD_SERVICE_TOKEN` 에 넣는다 (`secret.yaml.example` 참고 — 실제 값은 커밋하지 않음).

### 왜 이게 "다른 사람 보드"로부터 안전한가

MCP 클라이언트는 인증하지 않지만, 서버가 대신 쓰는 서비스 계정은 whiteboard-server 의
일반 계정과 동일한 멤버십 규칙을 그대로 따른다 — `list_boards` 는 그 계정이 이미
멤버인 보드만 보여준다(무작위로 다른 사람 보드를 나열/검색할 방법이 없음).

한 가지 더 막아야 하는 경로가 있었다: whiteboard-server 의 `GET /boards/{id}` 는
"링크 공유"를 지원하려고 **멤버가 아니어도 최초 조회 시 자동으로 editor 로 등록**한다
(사람이 공유 링크를 여는 것과 같은 동작 — `BoardController`/`BoardService` 참고). export/import
도 내부적으로 이 조회를 거치므로, board id 하나만 알면(추측·유출) 서비스 계정이 그 보드에
자동으로 가입되어 버릴 수 있었다. 그래서 `src/whiteboardClient.ts` 의 `assertMember()` 가
board 를 실제로 건드리기 전에 "이미 멤버인 보드인가"를 `listBoards()` 로 먼저 확인하고,
아니면 즉시 거부한다 — `get_board`, `rename_board`, `delete_board`, 그리고 모든 콘텐츠
도구(export/import 를 거치는)가 이 검사를 통과해야 한다. `create_board` 로 만든 보드,
또는 whiteboard-web 에서 이 서비스 계정을 명시적으로 멤버로 추가한 보드만 MCP 로
접근할 수 있다.

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
(`../whiteboard-server && ./gradlew bootRun`) 테스트용 계정으로 PAT 를 발급해
`WHITEBOARD_SERVICE_TOKEN` 으로 넣고, `curl` 로 Streamable HTTP 요청
(`initialize` → `tools/list` → `tools/call`)을 보내보는 것이 가장 빠른 수동 검증이다 —
이땐 MCP 요청 자체엔 `Authorization` 헤더를 넣지 않아도 된다(위 "인증" 참고).

## 배포

`Dockerfile`(멀티스테이지 → 경량 Node 런타임, non-root)로 `ghcr.io/ghghtygh/whiteboard-mcp` 에
이미지를 빌드한다. k8s 매니페스트는 `../k8s-manifests/apps/whiteboard-mcp` 참고 — Ingress 는
`wb.gpglab.site/mcp` 를 이 서비스로 라우팅한다.
