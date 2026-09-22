import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeGraph } from '../board/graphCodec.js'
import { viewUrl, WHITEBOARD_WEB_ORIGIN } from '../config.js'
import { getIconDataUri } from '../board/iconCache.js'
import { devIconDataUri, simpleIconDataUri } from '../board/catalogIcons.js'
import { edgeSchema, graphArg, groupSchema, nodeSchema } from './schemas.js'
import { withErrorHandling } from './util.js'
import { WIDGET_HTML } from '../ui/widgetHtml.js'

const WIDGET_URI = 'ui://whiteboard/graph.html'

const widgetNodeSchema = nodeSchema.extend({ icon: z.string().nullable() })

/**
 * 노드 타입의 아이콘을 우선순위대로 시도한다 — whiteboard-web(src/canvas/icons.ts)과 동일한
 * 순서: devicon → simple-icons(둘 다 이 서버에 번들된 로컬 파일, data: URI로 인라인) →
 * whiteboard-server 색상+이니셜 폴백 배지. 셋 다 data: URI 로 귀결되는 이유는
 * board/catalogIcons.ts 상단 주석 참고 — 외부 URL 이미지가 ChatGPT 위젯 iframe 에서 (CSP 로는
 * 허용된 도메인이어도) 렌더링이 안 되는 걸 실측으로 확인했다.
 */
async function resolveIcon(type: string): Promise<string | null> {
  const dev = devIconDataUri(type)
  if (dev) return dev
  const simple = simpleIconDataUri(type)
  if (simple) return simple
  return getIconDataUri(type)
}

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
    { mimeType: 'text/html;profile=mcp-app' },
    async () => ({
      contents: [
        {
          uri: WIDGET_URI,
          mimeType: 'text/html;profile=mcp-app',
          text: WIDGET_HTML,
          // ChatGPT 위젯 iframe 은 기본적으로 외부 도메인 리소스 로딩을 CSP 로 막고, 심지어
          // CSP 로 허용된 외부 도메인(cdn.jsdelivr.net)이어도 실제로는 이미지가 안 뜨는 걸
          // 확인했다(board/catalogIcons.ts 참고) — 그래서 노드 아이콘은 전부 data: URI 로
          // 인라인하는 쪽으로 바꿨고 더 이상 이 선언에 의존하지 않는다. wb.gpglab.site 는 CSP
          // 기본 허용 목록에 없으니, 혹시 위젯이 나중에 다른 외부 리소스를 참조하게 될 경우를
          // 대비해서만 남겨둔다. Apps SDK 예제에 따르면 widgetCSP 는 (resource 등록 config 가
          // 아니라) 이 content 항목의 _meta 에 실어야 한다.
          _meta: {
            'openai/widgetCSP': {
              connect_domains: [WHITEBOARD_WEB_ORIGIN],
              resource_domains: [WHITEBOARD_WEB_ORIGIN],
            },
          },
        },
      ],
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
      const types = [...new Set(decoded.nodes.map((node) => node.type))]
      const iconByType = new Map(await Promise.all(types.map(async (type) => [type, await resolveIcon(type)] as const)))
      const nodes = decoded.nodes.map((node) => ({ ...node, icon: iconByType.get(node.type) ?? null }))
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
