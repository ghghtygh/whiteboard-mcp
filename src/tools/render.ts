import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeGraph } from '../board/graphCodec.js'
import { viewUrl, WHITEBOARD_WEB_ORIGIN } from '../config.js'
import { getIconDataUri } from '../board/iconCache.js'
import { devIconUrl, simpleIconDataUri } from '../board/catalogIcons.js'
import { edgeSchema, graphArg, groupSchema, nodeSchema } from './schemas.js'
import { withErrorHandling } from './util.js'
import { WIDGET_HTML } from '../ui/widgetHtml.js'

const WIDGET_URI = 'ui://whiteboard/graph.html'

const widgetNodeSchema = nodeSchema.extend({ icon: z.string().nullable() })

/**
 * 노드 타입의 아이콘을 우선순위대로 시도한다 — whiteboard-web(src/canvas/icons.ts)과 동일한
 * 순서: devicon(브랜드 원본 색상, jsdelivr CDN 직링크 — 이 서버를 거치지 않음) → simple-icons
 * (무채색이라 이 서버가 hex 색을 입혀서 data: URI로) → whiteboard-server 색상+이니셜 폴백 배지.
 */
async function resolveIcon(type: string): Promise<string | null> {
  const dev = devIconUrl(type)
  if (dev) return dev
  const simple = await simpleIconDataUri(type)
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
          // ChatGPT 위젯 iframe 은 기본적으로 외부 도메인 리소스 로딩을 CSP 로 막는다(실측: img-src
          // 에 data: 와 cdn.jsdelivr.net 은 기본 허용, 그 외 임의 https 도메인은 없음). 노드
          // 아이콘은 devicon(jsdelivr, 기본 허용) → simple-icons(이 서버가 색을 입혀 data: URI로
          // 인라인) → whiteboard-server 폴백 배지(data: URI로 인라인) 순으로 CSP 를 통과하게
          // 짰지만, wb.gpglab.site 는 기본 허용 목록에 없으니 혹시 모를 외부 참조를 위해 도메인
          // 허용을 남겨둔다. Apps SDK 예제에 따르면 widgetCSP 는 (resource 등록 config 가 아니라)
          // 이 content 항목의 _meta 에 실어야 한다.
          _meta: {
            'openai/widgetCSP': {
              connect_domains: [WHITEBOARD_WEB_ORIGIN],
              resource_domains: [WHITEBOARD_WEB_ORIGIN, 'https://cdn.jsdelivr.net'],
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
