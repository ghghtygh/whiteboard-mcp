import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { decodeGraph } from '../board/graphCodec.js'
import { viewUrl } from '../config.js'
import { edgeSchema, graphArg, groupSchema, nodeSchema } from './schemas.js'
import { withErrorHandling } from './util.js'
import { WIDGET_HTML } from '../ui/widgetHtml.js'

const WIDGET_URI = 'ui://whiteboard/graph.html'

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
        nodes: z.array(nodeSchema),
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
      const summary =
        `Whiteboard with ${decoded.nodes.length} node(s), ${decoded.edges.length} edge(s), ` +
        `${decoded.groups.length} group(s). Non-widget clients: open ${url} to view it.`
      return {
        content: [{ type: 'text', text: summary }],
        structuredContent: { graph, url, ...decoded },
      }
    }),
  )
}
