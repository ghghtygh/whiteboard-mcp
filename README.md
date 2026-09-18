# whiteboard-mcp

`../whiteboard-web` 스타일의 그래프(노드/엣지/그룹)를 [MCP](https://modelcontextprotocol.io)
클라이언트(Claude 등)로 만들고 공유하는 remote MCP 서버. Node.js / TypeScript, Streamable
HTTP 전송.

## 핵심 아이디어 — 그래프는 URL 안에 산다

이 서버는 **어떤 그래프도 저장하지 않는다.** PlantUML 이 다이어그램 소스를 URL 에 압축해
넣는 것과 같은 방식으로, 그래프 전체(노드/엣지/그룹)를 압축·인코드한 문자열이 곧 그
그래프의 유일한 식별자다. 도구를 호출할 때마다 이 문자열(`graph` 토큰)을 주고받는다 —
서버 재시작 사이에도, 서로 다른 도구 호출 사이에도 서버는 아무 상태를 들고 있지 않는다
(완전히 stateless).

```
create_graph()
  → { graph: "eJyrVs...", url: "https://wb.gpglab.site/view/eJyrVs..." }
add_node(graph, "server", 200, 200)
  → { id: "ab12cd34ef", graph: "<새 토큰>", url: "https://.../view/<새 토큰>" }
...
```

이렇게 설계한 이유는 **"인증 없이 누구나 쓸 수 있어야 하지만, 서로 다른 이용자가 만든
그래프끼리는 노출되면 안 된다"** 는 요구사항 때문이다. 계정·DB·멤버십으로 격리하는 대신,
애초에 서버에 "목록" 이라는 개념을 없앴다 — 그래프를 가리키는 URL 을 아는 사람만 그
그래프를 볼 수 있고, 그 URL 은 오직 만든 사람(과 그가 공유한 사람)만 안다. 1회용 스케치
용도로 충분한 강도이고(토큰은 128비트급 압축 데이터라 추측 불가능), 서비스 계정·PAT
관리·자동 만료 같은 인프라가 전혀 필요 없다.

## 아키텍처

```
MCP 클라이언트 (Claude 등, 인증 없음)
  │ Streamable HTTP — graph 토큰을 매 호출마다 주고받음
  ▼
whiteboard-mcp (이 서비스, 완전히 stateless)
  │ (선택) list_catalog: 공개 카탈로그 조회, 인증 불필요
  │ (선택) save_as_board: 호출자 자신의 whiteboard-server 토큰으로 1회 보드 생성
  ▼
whiteboard-server ──────────────────────────────────────────── whiteboard-web
                                                                  /view/:token 뷰어가
                                                                  같은 인코딩을 디코드해 렌더링
```

- **`src/board/graphCodec.ts`** — `JSON.stringify(graph)` → deflate → base64url. `../whiteboard-web`
  의 `src/board/graphCodec.ts` 가 정확히 같은 포맷을 읽어 `/view/:token` 에서 렌더링한다(두 파일은
  수동으로 동기화 — 공유 패키지 없음).
- **`src/board/ops.ts`** — whiteboard-web 의 `src/canvas/ops.ts` 와 동일한 cross-cutting
  규칙(노드 삭제 시 엣지 정리, 그룹 생성/이동 시 노드 자동 편입)을 순수 JS 배열 위에서
  구현한 것. Yjs/CRDT 를 전혀 쓰지 않는다 — 저장할 실시간 문서가 없기 때문이다.
- **`save_as_board`** (선택적 브릿지) — 그래프를 진짜 whiteboard-web 보드(협업·영속화 가능)로
  옮기고 싶을 때만 쓴다. 이때만 whiteboard-server 를 호출하고, 그마저도 호출자 자신의
  토큰(`accessToken` 인자)으로만 동작한다 — 이 서버가 들고 있는 공용 자격증명은 없다.

## 실행

```bash
npm install
cp .env.example .env
npm run dev   # http://localhost:3000/mcp
```

| 환경변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | 이 서버가 리슨할 포트 |
| `WHITEBOARD_API_ORIGIN` | `http://localhost:8080` | whiteboard-server REST 베이스 URL (list_catalog/save_as_board 전용) |
| `WHITEBOARD_WEB_ORIGIN` | `http://localhost:5173` | 공유 링크(`/view/{token}`)를 절대 URL로 만드는 데 쓰는 whiteboard-web 오리진 |

### 헬스체크 (k8s probe)

| 경로 | 용도 |
|---|---|
| `GET /healthz` | livenessProbe |
| `GET /readyz` | readinessProbe |

## 제공 도구

**그래프 편집** (모두 `graph` 토큰을 받아 새 토큰을 돌려준다):
`create_graph`, `get_graph`,
`add_node` / `move_node` / `set_node_label` / `remove_node`,
`add_edge` / `set_edge_style` / `set_edge_direction` / `set_edge_label` / `remove_edge`,
`add_group` / `move_group` / `set_group_label` / `remove_group`,
`apply_operations` (배치 — 아래 참고)

**부가 기능**: `list_catalog` (인증 불필요), `save_as_board` (호출자 본인 토큰 필요),
`render_graph` (ChatGPT 등에서 인터랙티브 위젯으로 표시 — 아래 참고)

노드 삭제 시 연결된 엣지 정리, 그룹 생성/이동 시 노드 자동 편입 같은 cross-cutting 규칙은
`src/board/ops.ts` 안에서 보장된다 — 도구 핸들러가 직접 배열을 만지지 않는다.

### 도구 설계 규칙

- **`graph` 는 필수다.** 빈 문자열을 "새 그래프"로 받아주지 않는다 — `create_graph` 를
  거치지 않고 실수로 빈 상태에서 다시 시작하는 사고를 막기 위해서다.
- **잘못된 참조는 항상 명확한 에러다.** 존재하지 않는 노드/엣지/그룹 id, 카탈로그에 없는
  `type`, 자기 자신에게 잇는 엣지 — 전부 `{isError: true}` + `CODE: message` 형태로
  올라온다(`NODE_NOT_FOUND`, `EDGE_NOT_FOUND`, `GROUP_NOT_FOUND`, `UNKNOWN_COMPONENT_TYPE`,
  `INVALID_EDGE`, `UNKNOWN_REF`, `GRAPH_TOKEN_REQUIRED`). `{ ok: false }` 를 조용히
  돌려주는 경로는 없다.
- **좌표 규약이 통일돼 있다.** `add_node`/`move_node` 는 둘 다 노드의 **중심** 좌표를
  받는다. `add_group` 의 (x, y)는 좌상단, `move_group` 의 (dx, dy)는 상대 이동량이다
  (그룹은 원래부터 "중심" 개념이 없어 그대로 뒀다) — 도구 description 과
  `McpServer` 의 `instructions` 양쪽에 명시돼 있다.
- **모든 도구가 `inputSchema` + `outputSchema` 를 선언**하고, 응답은 `content`(사람이
  읽는 텍스트)와 `structuredContent`(그 outputSchema 를 따르는 실제 데이터) 둘 다
  포함한다.
- **`add_node` 의 `type` 은 카탈로그로 검증된다** — `list_catalog` 가 반환하지 않는
  타입은 거부된다(내부적으로 카탈로그를 5분 캐싱해 매 호출마다 whiteboard-server 를
  때리지 않는다).

### `apply_operations` — 배치 + 임시 ref

여러 노드/엣지/그룹을 한 번에 만들 때 `add_node`/`add_edge`/`...` 를 여러 번 왕복하는 대신
쓴다. `add_node`/`add_edge`/`add_group` 항목에 `ref`(임의의 이름)를 붙이면, 같은 배치 안의
뒤따르는 항목에서 실제 id 를 몰라도 `"$ref:<name>"` 으로 그걸 가리킬 수 있다:

```json
{
  "graph": "...",
  "operations": [
    { "op": "add_node", "ref": "api", "type": "server", "x": 200, "y": 200 },
    { "op": "add_node", "ref": "db", "type": "database", "x": 400, "y": 200 },
    { "op": "add_edge", "from": "$ref:api", "to": "$ref:db" }
  ]
}
```

배치는 한 트랜잭션이다 — 중간에 하나라도 실패하면(알 수 없는 타입/ref/id 등) 그 시점까지의
변경은 전부 버려지고 원래 `graph` 토큰은 그대로 유효하다(에러 응답엔 새 토큰이 없다).

## MCP 클라이언트 설정

인증이 필요 없다 — 바로 접속한다:

```json
{
  "mcpServers": {
    "whiteboard": {
      "url": "https://wb.gpglab.site/mcp"
    }
  }
}
```

## 뷰어 — whiteboard-web `/view/:token`

별도의 "링크 만들기" 도구는 없다 — 모든 도구 응답의 `url` 필드가 곧 그 시점의 그래프를
볼 수 있는 링크다. whiteboard-web 이 이 링크를 열면:

1. 토큰을 디코드해 임시(비영속) `Y.Doc` 을 메모리에 만들고 기존 `Canvas` 컴포넌트로 그린다
   (IndexedDB/WebSocket 없음 — 새로고침하면 URL 에 인코드된 상태로 다시 그려질 뿐).
2. 그 자리에서 자유롭게 편집할 수 있고(드래그 이동, 엣지 연결 등 기존 캔버스 인터랙션
   그대로), 편집할 때마다 주소창 URL 이 실시간으로 그 상태를 반영하도록 갱신된다 —
   PlantUML 에디터가 텍스트를 고치면 URL 이 따라 바뀌는 것과 같은 동작.
3. "Copy link" 로 현재 상태의 URL 을 복사해 공유한다.

## `render_graph` — ChatGPT Apps SDK 위젯 (뷰어 전용, 1차 스코프)

`get_graph`/`add_node` 같은 데이터 도구와 UI 도구를 분리했다 — 모든 mutation 에 위젯을
붙이면 노드 하나 추가할 때마다 iframe 이 다시 렌더링돼 버리므로, `render_graph` 는
사용자가 명시적으로 결과를 보고 싶을 때만 한 번 부르는 도구다(`McpServer` 의
`instructions` 에도 이 사용법을 명시해 뒀다).

- `src/tools/render.ts` 가 `ui://whiteboard/graph.html` 리소스(`text/html;profile=mcp-app`)를
  등록하고, `render_graph` 도구의 `_meta` 로 그 리소스를 가리킨다.
- 위젯(`src/ui/widgetHtml.ts`)은 React/Konva 를 쓰지 않는 순수 HTML/SVG/JS다 — ChatGPT 가
  로드하는 샌드박스 iframe 은 빌드 단계 없이 정적 리소스를 그대로 실행하므로,
  whiteboard-web 의 실제 `Canvas` 컴포넌트(React+Konva 번들)를 그대로 재사용할 수 없다.
  대신 같은 데이터(노드/엣지/그룹)를 그리는 작은 SVG 렌더러를 새로 짰다 — 픽셀 단위로
  똑같진 않지만 구조는 동일하다.
- **1차 스코프는 뷰어 전용이다** — pan(드래그)/zoom(휠)만 가능하고 노드 이동·생성·삭제는
  없다. 위젯에서 `move_node` 등을 다시 호출하는(양방향 편집) 건 2차 이후 과제로 남겨뒀다.
- 위젯은 `window.openai.toolOutput` (render_graph 가 반환한 structuredContent)에서 데이터를
  읽는다. **이 계약(정확한 전역 객체/이벤트 이름)은 이 저장소 환경에서 OpenAI 의 라이브
  문서를 fetch 할 수 없어 학습 시점 지식 기준으로 작성했다** — ChatGPT 에서 실제로 확인해
  위젯이 비어 있거나 데이터를 못 읽으면 `src/ui/widgetHtml.ts` 의 `getGlobals()`/
  `openai:set_globals` 리스너 부분과 `src/tools/render.ts` 의 `_meta`(`ui.resourceUri` /
  `openai/outputTemplate` 둘 다 넣어뒀다)부터 의심할 것. Claude 등 위젯을 모르는 클라이언트는
  `structuredContent.url`(=`/view/{token}`)로 그냥 열어보면 된다.
- 로컬에서 mock `window.openai.toolOutput` 을 주입해 Playwright 로 렌더링 자체(노드 박스,
  화살표 방향/스타일, 그룹 경계, pan/zoom)는 검증했다 — ChatGPT 안에서 실제로 데이터가
  전달되는지는 검증 못 했다.

## 왜 이게 안전한가 / 한계

- **격리는 발견 불가능성에서 온다, 계정 분리가 아니다.** 서버가 "누구의 그래프인가"를
  구분할 방법 자체가 없다 — 그래프를 나열하는 도구도, 저장하는 DB 도 없다. 토큰을 아는
  사람만 그 그래프에 접근할 수 있다(토큰은 압축된 JSON 이라 추측이 사실상 불가능하다).
- **URL 길이가 유일한 실질적 제약이다.** 수십 개 노드 규모의 스케치는 압축 후 수백
  바이트~1~2KB 로, 문제없이 URL 에 들어간다(로컬 테스트: 노드 2개+엣지 1개+그룹 1개가
  약 330자). 수백 개 단위로 아주 커지면 브라우저/프록시의 URL 길이 한계에 걸릴 수 있다 —
  1회용 스케치 용도를 벗어난 규모라면 `save_as_board` 로 진짜 보드로 옮기는 걸 권장한다.
- **진짜 실시간 협업은 없다.** 이 그래프는 스냅샷이라 Yjs CRDT 동기화가 붙지 않는다.
  여러 명이 같이 계속 편집하고 싶으면 `save_as_board` 로 옮겨서 whiteboard-web 의 정식
  실시간 동기화(`../whiteboard-socket`)를 쓴다.

## 검증

```bash
npm run typecheck
npm run build
```

별도 테스트 러너는 아직 없다. 로컬에서 `curl` 로 Streamable HTTP 요청
(`initialize` → `tools/list` → `tools/call`)을 보내 `create_graph` → `add_node` →
`get_graph` 로 왕복시켜 보는 것이 가장 빠른 수동 검증이다 — whiteboard-server 를 띄우지
않아도 된다(list_catalog/save_as_board 를 안 쓰면).

## 배포

`Dockerfile`(멀티스테이지 → 경량 Node 런타임, non-root)로 `ghcr.io/ghghtygh/whiteboard-mcp` 에
이미지를 빌드한다. k8s 매니페스트는 `../k8s-manifests/apps/whiteboard-mcp` 참고 — Ingress 는
`wb.gpglab.site/mcp` 를 이 서비스로 라우팅한다. 이 서비스는 자체 상태가 없어 시크릿이나
DB 설정이 필요 없다.
