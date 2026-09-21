import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeGraph } from '../board/graphCodec.js'
import { viewUrl, WHITEBOARD_WEB_ORIGIN } from '../config.js'
import { edgeSchema, graphArg, groupSchema, nodeSchema } from './schemas.js'
import { withErrorHandling } from './util.js'
import { WIDGET_HTML } from '../ui/widgetHtml.js'

const WIDGET_URI = 'ui://whiteboard/graph.html'

/** 노드 아이콘 배지(색상+이니셜) — whiteboard-server 가 어떤 카탈로그 타입에든 항상 만들어주는
 * 폴백 SVG다. 실제 브랜드 로고(devicon/simple-icons)는 whiteboard-web 번들 안에만 있어 이
 * 위젯(정적 HTML, 빌드 단계 없음)에서는 못 쓴다 — 위젯은 항상 이 배지로 보인다. 위젯은
 * whiteboard-server 를 직접 호출하지 않는 사용자 브라우저에서 도니, 클러스터 내부 전용인
 * WHITEBOARD_API_ORIGIN 이 아니라 공개 오리진(WHITEBOARD_WEB_ORIGIN)의 /api 경로를 쓴다. */
function iconUrl(type: string): string {
  return `${WHITEBOARD_WEB_ORIGIN}/api/v1/icons/${encodeURIComponent(type)}.svg`
}

const widgetNodeSchema = nodeSchema.extend({ iconUrl: z.string() })

/**
 * render_graph — 1차 스코프는 "뷰어만, 편집 없음"(ChatGPT Apps SDK 위젯, pan/zoom 만).
 * add_node 같은 데이터 도구와 분리해 둔 이유: 모든 mutation 도구에 위젯을 붙이면 노드 하나
 * 추가할 때마다 iframe 이 다시 렌더링돼 버린다 — OpenAI 가 권장하는 대로 데이터 도구와 UI
 * 도구를 분리하고, 사용자가 명시적으로 "보여줘"라고 할 때만 이 도구를 쓰게 한다.
 *
 * _meta 의 정확한 필드명(ui.resourceUri / openai/outputTemplate)은 이 저장소에서 OpenAI 의
 * 라이브 문서를 fetch 할 수 없어(네트워크 egress 차단) 확인이 안 된 상태다 — 두 관례를 함께
 * 넣어 어느 쪽을 읽든 동작하게 했다. ChatGPT 에서 위젯이 안 뜨면 여기부터 의심할 것.
 */
export function registerRenderTool(server: McpServer) {
  server.registerResource(
    'whiteboard-graph-widget',
    WIDGET_URI,
    {
      mimeType: 'text/html;profile=mcp-app',
      // ChatGPT 위젯 iframe 은 기본적으로 외부 도메인 리소스 로딩을 막는다 — 노드 아이콘
      // <image href>가 WHITEBOARD_WEB_ORIGIN(/api/v1/icons/*.svg)을 가리키므로 이 도메인을
      // 명시적으로 허용해야 한다. 필드명(openai/widgetCSP)은 라이브 문서 fetch 가 막혀 있어
      // 확인이 안 된 상태 — 위젯 아이콘이 계속 깨져 보이면 여기부터 의심할 것.
      _meta: {
        'openai/widgetCSP': {
          connect_domains: [WHITEBOARD_WEB_ORIGIN],
          resource_domains: [WHITEBOARD_WEB_ORIGIN],
        },
      },
    },
    async () => ({
      contents: [{ uri: WIDGET_URI, mimeType: 'text/html;profile=mcp-app', text: WIDGET_HTML }],
    }),
  )

  server.registerTool(
    'render_graph',
    {
      title: 'Display whiteboard',
      description:
        'Display the graph as an interactive (pan/zoom, read-only) whiteboard widget. Use this only ' +
        'when the user wants to SEE the diagram, not after every single edit — keep making changes ' +
        'with add_node/apply_operations/etc. first, then call this once when the result is ready to show.',
      inputSchema: { graph: graphArg },
      outputSchema: {
        graph: graphArg,
        url: z.string(),
        nodes: z.array(widgetNodeSchema),
        edges: z.array(edgeSchema),
        groups: z.array(groupSchema),
      },
      _meta: {
        ui: { resourceUri: WIDGET_URI },
        'openai/outputTemplate': WIDGET_URI,
        'openai/toolInvocation/invoking': 'Rendering the whiteboard…',
        'openai/toolInvocation/invoked': 'Whiteboard ready',
      },
    },
    withErrorHandling(async ({ graph }) => {
      const decoded = decodeGraph(graph)
      const url = viewUrl(graph)
      const nodes = decoded.nodes.map((node) => ({ ...node, iconUrl: iconUrl(node.type) }))
      const summary =
        `Whiteboard with ${decoded.nodes.length} node(s), ${decoded.edges.length} edge(s), ` +
        `${decoded.groups.length} group(s). Non-widget clients: open ${url} to view it.`
      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: { graph, url, ...decoded, nodes },
      }
    }),
  )
}
